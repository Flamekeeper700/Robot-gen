import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Safely resolves a nested dot-notation path inside an object.
 * e.g., "data.modules.items" -> obj['data']['modules']['items']
 */
function resolvePath(obj, pathString) {
    if (!pathString || !obj) return obj;
    return pathString.split('.').reduce((acc, part) => {
        if (acc && part in acc) {
            return acc[part];
        }
        return undefined;
    }, obj);
}

/**
 * Main dynamic parsing engine. Extracts classes, methods, and types
 * based on rules mapped in sources.json.
 */
function parseSourceDynamically(rawData, config) {
    const classes = {};
    const extractor = config.classExtractor;
    
    // Locate the root collection of components
    const rootData = resolvePath(rawData, extractor.rootPath);
    
    if (!rootData) {
        console.log(`   ❌ [Path Failure] Could not find root path "${extractor.rootPath}" in the downloaded schema.`);
        return classes;
    }

    // Case A: Root structure is a standard Key-Value Object Map (e.g., OpenAPI paths)
    if (!Array.isArray(rootData)) {
        console.log(`   ℹ️ Root path is an Object map. Using 'classNamePattern' rules.`);
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
                parameters: [{ name: "payload", type: "String" }],
                template: `\${instance}.${cleanMethodName}(\${payload});`
            };
        });
        return classes;
    }

    // Case B: Root structure is a flat Array of definitions (e.g., Javadoc index registers, SDK manifests)
    console.log(`   ℹ️ Root path is an Array containing ${rootData.length} entries.`);
    
    rootData.forEach((item, index) => {
        const className = resolvePath(item, extractor.classNamePath);
        
        // Javadoc indices save the package name directly inside the item attributes
        // Fall back to the configured default hardcoded packageName if not found in the payload
        const rawPackage = resolvePath(item, "p") || extractor.packageName;

        if (!className || !rawPackage) return;

        // Skip non-class utility entities or nested path anomalies
        if (className.includes('/') || className.toLowerCase() === className) return;

        // GLOBAL PACKAGE FILTERING: Keeps definitions.json lightweight and optimized
        if (extractor.packageFilters && extractor.packageFilters.length > 0) {
            const matchesFilter = extractor.packageFilters.some(filter => rawPackage.startsWith(filter));
            if (!matchesFilter) return; // Skip this class to optimize space
        }

        const resolvedImport = extractor.importPath 
            ? extractor.importPath.replace('${className}', className)
            : `${rawPackage}.${className}`;

        classes[className] = {
            package: rawPackage,
            imports: [resolvedImport],
            constructors: [{ parameters: [] }],
            methods: {}
        };

        // Extract methods / members array block
        const methodsArray = resolvePath(item, extractor.methodNameSource);
        if (Array.isArray(methodsArray)) {
            methodsArray.forEach(methodItem => {
                const methodName = resolvePath(methodItem, extractor.methodNamePath);
                if (!methodName) return;

                const returnType = resolvePath(methodItem, extractor.returnTypePath) || extractor.returnTypeDefault || "void";
                const rawParams = resolvePath(methodItem, extractor.parameterPath) || [];

                classes[className].methods[methodName] = {
                    returnType: returnType,
                    parameters: Array.isArray(rawParams) ? rawParams.map(p => ({
                        name: p.name || p,
                        type: p.type || "String"
                    })) : [],
                    template: `\${instance}.${methodName}();`
                };
            });
        }
    });

    return classes;
}

async function main() {
    console.log("🏁 Starting Universal Dynamic Configuration Sync Engine...");

    const configsDir = path.join(process.cwd(), 'configs');
    const sourcesPath = path.join(configsDir, 'sources.json');
    const outputPath = path.join(configsDir, 'definitions.json');

    if (!fs.existsSync(sourcesPath)) {
        console.error(`❌ Dependency Error: Manifest list file not found at: ${sourcesPath}`);
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

    // Main iteration loop through your data sources list
    for (const source of sources) {
        console.log(`\n--------------------------------------------------`);
        console.log(`📥 Ingesting Source: "${source.name}"`);
        console.log(`🌐 Fetch Target URL: ${source.url}`);
        
        try {
            const res = await fetch(source.url);
            
            if (!res.ok) {
                console.warn(`   ❌ Network Error: Remote endpoint dropped connection with code ${res.status}`);
                continue;
            }

            let rawData;
            
            // Handle JavaScript-wrapped Javadoc Search Registries (*.js files)
            if (source.isJavadocIndex || source.url.endsWith('.js')) {
                console.log("   ℹ️ Parsing target as an active JavaScript search index window asset...");
                const textData = await res.text();
                
                // Extract inner JSON boundary strings safely 
                const jsonStart = textData.indexOf('{');
                const jsonEnd = textData.lastIndexOf('}');
                
                if (jsonStart === -1 || jsonEnd === -1) {
                    console.warn("   ❌ Error: script index could not find bounded JSON braces.");
                    continue;
                }
                
                const sanitizedJson = textData.substring(jsonStart, jsonEnd + 1);
                rawData = JSON.parse(sanitizedJson);
            } else {
                // Read as a standard JSON data payload
                rawData = await res.json();
            }

            console.log(`   📥 Manifest payload parsed successfully (${JSON.stringify(rawData).length} bytes).`);
            
            const translatedClasses = parseSourceDynamically(rawData, source);
            const classCount = Object.keys(translatedClasses).length;

            if (classCount > 0) {
                Object.assign(masterDefinitions.classes, translatedClasses);
                masterDefinitions.metadata.apisProcessed.push(source.name);
                console.log(`   🎉 Successfully merged ${classCount} dynamic classes for "${source.name}".`);
            } else {
                console.log(`   ⚠️ System Warning: Run complete, but 0 classes matched filtering parameters.`);
            }

        } catch (err) {
            console.warn(`   ❌ Critical Extraction Error processing source "${source.name}":`, err.message);
        }
    }

    console.log(`\n--------------------------------------------------`);
    
    // Ensure the output configuration directory exists before updating definitions
    if (!fs.existsSync(configsDir)) {
        fs.mkdirSync(configsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(masterDefinitions, null, 2), 'utf-8');
    console.log(`📝 Output compiled cleanly to static data matrix: ${outputPath}`);
    console.log(`🏁 Engine Shutdown. Processed API targets: [${masterDefinitions.metadata.apisProcessed.join(', ')}]\n`);
}

main();