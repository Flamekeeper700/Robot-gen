import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

// Helper function to resolve nested JSON keys using string paths (e.g., "modules" or "post.parameters")
function resolvePath(obj, pathString) {
    if (!pathString || !obj) return obj;
    return pathString.split('.').reduce((acc, part) => acc && acc[part], obj);
}

// Universal dynamic translator
function parseSourceDynamically(rawData, config) {
    const classes = {};
    const extractor = config.classExtractor;
    
    // Find where the classes/modules live in the raw response
    const rootData = resolvePath(rawData, extractor.rootPath);
    
    if (!rootData) return classes;

    // Handle case where root data is an Object (like OpenAPI paths)
    if (!Array.isArray(rootData)) {
        const className = extractor.classNamePattern || "GeneratedClient";
        classes[className] = {
            package: extractor.packageName,
            imports: [extractor.importPath],
            constructors: [{ parameters: [] }],
            methods: {}
        };

        Object.keys(rootData).forEach(key => {
            const cleanMethodName = key.replace(/\//g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            if (!cleanMethodName) return;

            classes[className].methods[cleanMethodName] = {
                returnType: extractor.returnTypeDefault || "void",
                parameters: [{ name: "payload", type: "string" }],
                template: `\${instance}.${cleanMethodName}(\${payload});`
            };
        });
        return classes;
    }

    // Handle case where root data is an Array of components (like standard SDK manifests)
    rootData.forEach(item => {
        const className = resolvePath(item, extractor.classNamePath);
        if (!className) return;

        const resolvedImport = extractor.importPath.replace('${className}', className);

        classes[className] = {
            package: extractor.packageName,
            imports: [resolvedImport],
            constructors: [{ parameters: [] }],
            methods: {}
        };

        // Extract methods loop
        const methodsArray = resolvePath(item, extractor.methodNameSource);
        if (Array.isArray(methodsArray)) {
            methodsArray.forEach(methodItem => {
                const methodName = resolvePath(methodItem, extractor.methodNamePath);
                if (!methodName) return;

                const returnType = resolvePath(methodItem, extractor.returnTypePath) || extractor.returnTypeDefault || "void";
                const rawParams = resolvePath(methodItem, extractor.parameterPath) || [];

                classes[className].methods[methodName] = {
                    returnType: returnType,
                    parameters: Array.isArray(rawParams) ? rawParams.map(p => ({ name: p.name || p, type: p.type || "string" })) : [],
                    template: `\${instance}.${methodName}();`
                };
            });
        }
    });

    return classes;
}

async function main() {
    console.log("🏁 Starting Completely Universal Auto-Parser Engine...");

    const configsDir = path.join(process.cwd(), 'configs');
    const sourcesPath = path.join(configsDir, 'sources.json');
    const outputPath = path.join(configsDir, 'definitions.json');

    if (!fs.existsSync(sourcesPath)) {
        console.error(`❌ Error: Could not find sources manifest file at ${sourcesPath}`);
        return;
    }

    const { sources } = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));

    const masterDefinitions = {
        metadata: {
            generatedAt: new Date().toISOString(),
            apisProcessed: []
        },
        classes: {}
    };

    // SINGLE AUTOMATED LOOP: Processes any number of URLs dynamically
    for (const source of sources) {
        try {
            console.log(`📥 Automatically processing: ${source.name} from URL...`);
            const res = await fetch(source.url);
            
            if (!res.ok) {
                console.warn(`⚠️ Skipped ${source.name}: Remote server responded with HTTP ${res.status}`);
                continue;
            }

            const rawData = await res.json();
            const translatedClasses = parseSourceDynamically(rawData, source);
            
            Object.assign(masterDefinitions.classes, translatedClasses);
            masterDefinitions.metadata.apisProcessed.push(source.name);

        } catch (err) {
            console.warn(`⚠️ Failed to parse API source "${source.name}" due to network/parsing constraints:`, err.message);
        }
    }

    fs.writeFileSync(outputPath, JSON.stringify(masterDefinitions, null, 2), 'utf-8');
    console.log(`\n✅ Finished! Auto-generated definitions file tracking: [${masterDefinitions.metadata.apisProcessed.join(', ')}]`);
}

main();