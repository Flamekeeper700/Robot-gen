import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Safely resolves a nested dot-notation path inside an object.
 */
function resolvePath(obj, pathString) {
    if (!pathString || !obj) return obj;
    return pathString.split('.').reduce((acc, part) => {
        if (acc && part in acc) return acc[part];
        return undefined;
    }, obj);
}

/**
 * Helper to strip Javascript assignment text and extract clean JSON objects or arrays.
 */
function cleanJavascriptJson(textData) {
    const firstBrace = textData.indexOf('{');
    const firstBracket = textData.indexOf('[');
    const lastBrace = textData.lastIndexOf('}');
    const lastBracket = textData.lastIndexOf(']');

    const validStart = Math.max(firstBrace, firstBracket) > -1 
        ? Math.min(firstBrace > -1 ? firstBrace : Infinity, firstBracket > -1 ? firstBracket : Infinity) 
        : -1;
    const validEnd = Math.max(lastBrace, lastBracket);
    
    if (validStart === -1 || validEnd === -1) {
        throw new Error("Could not find matching JSON boundaries inside the script file.");
    }
    
    return JSON.parse(textData.substring(validStart, validEnd + 1));
}

/**
 * Custom extractor built to handle standard JSON manifests and paired Javadoc indices.
 */
function parseSourceDynamically(rootData, config, rawMembers = []) {
    const classes = {};
    const extractor = config.classExtractor;

    if (!rootData || !Array.isArray(rootData)) {
        console.log(`   ❌ [Path Failure] Target root path could not be resolved as an iterable array payload.`);
        return classes;
    }

    console.log(`   ℹ️ Ingesting root collection containing ${rootData.length} entries.`);
    let matchedClassesCount = 0;
    
    rootData.forEach((item) => {
        let className = resolvePath(item, extractor.classNamePath);
        
        let rawPackage = item.p || extractor.packageName || "";
        if (!className || !rawPackage) return;

        if (className.includes('/') || className.toLowerCase() === className) return;

        className = className.replace(/<[^>]*>/g, '').trim();

        if (extractor.packageFilters && extractor.packageFilters.length > 0) {
            const matchesFilter = extractor.packageFilters.some(filter => rawPackage.startsWith(filter));
            if (!matchesFilter) return; 
        }

        const resolvedImport = `${rawPackage}.${className}`;

        let category = "utility";
        if (className.toLowerCase().includes("motor") || className.includes("Talon") || className.includes("Spark")) {
            category = "motor";
        } else if (className.toLowerCase().includes("gyro") || className.includes("Pigeon") || className.includes("NavX")) {
            category = "imu";
        }

        classes[className] = {
            name: className,
            package: rawPackage,
            category: category,
            imports: [resolvedImport],
            constructors: [{ parameters: [], template: `${className} \${instanceName} = new ${className}(\${param});` }],
            declarationTemplate: `${className} \${instanceName};`,
            methods: {}
        };
        matchedClassesCount++;
    });

    console.log(`   ✅ Extracted ${matchedClassesCount} valid classes matching package rules. Stitching methods...`);

    let methodCount = 0;
    if (Array.isArray(rawMembers)) {
        rawMembers.forEach(member => {
            const parentClassName = member.c;
            const methodNameWithParams = member.l; // Signature, e.g., "drive(double,double)"

            if (parentClassName && classes[parentClassName] && methodNameWithParams && methodNameWithParams.includes('(')) {
                const [cleanMethodName, paramsPart] = methodNameWithParams.split('(');
                
                // Extract and clean parameters
                const paramsString = paramsPart.replace(')', '');
                const parameters = paramsString ? paramsString.split(',').map(p => p.trim()) : [];

                if (cleanMethodName === parentClassName) return;

                classes[parentClassName].methods[cleanMethodName] = {
                    returnType: "void",
                    parameters: parameters,
                    template: `\${instance}.${cleanMethodName}(${parameters.map((_, i) => `\${param${i+1}}`).join(', ')});`
                };
                methodCount++;
            }
        });
        console.log(`   ⚡ Successfully bound ${methodCount} total methods to their parent class trees.`);
    }

    return classes;
}

async function main() {
    console.log("🏁 Starting Universal Automated API Sync Engine...");

    const configsDir = path.join(process.cwd(), 'configs');
    const sourcesPath = path.join(configsDir, 'sources.json');
    const outputPath = path.join(configsDir, 'definitions.json');

    if (!fs.existsSync(sourcesPath)) {
        console.error(`❌ Dependency Error: Sources tracking configuration missing at: ${sourcesPath}`);
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

    for (const source of sources) {
        console.log(`\n--------------------------------------------------`);
        console.log(`📥 Processing Target Source: "${source.name}"`);
        
        try {
            let rootData = null;
            let rawMembers = [];

            if (source.isJavadocIndex || source.url.endsWith('type-search-index.js')) {
                const typeRes = await fetch(source.url);
                const typeText = await typeRes.text();
                rootData = cleanJavascriptJson(typeText);

                const memberUrl = source.url.replace('type-search-index.js', 'member-search-index.js');
                const memberRes = await fetch(memberUrl);
                
                if (memberRes.ok) {
                    const memberText = await memberRes.text();
                    rawMembers = cleanJavascriptJson(memberText);
                }
            } else {
                const res = await fetch(source.url);
                const rawData = await res.json();
                rootData = source.classExtractor.rootPath ? resolvePath(rawData, source.classExtractor.rootPath) : rawData;
            }

            const translatedClasses = parseSourceDynamically(rootData, source, rawMembers);
            const classCount = Object.keys(translatedClasses).length;

            if (classCount > 0) {
                Object.assign(masterDefinitions.classes, translatedClasses);
                masterDefinitions.metadata.apisProcessed.push(source.name);
                console.log(`   🎉 Successfully updated definitions for "${source.name}".`);
            }
        } catch (err) {
            console.warn(`   ❌ Critical Exception executing pipeline for "${source.name}":`, err.message);
        }
    }

    if (!fs.existsSync(configsDir)) {
        fs.mkdirSync(configsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(masterDefinitions, null, 2), 'utf-8');
    console.log(`📝 Output saved cleanly to: ${outputPath}`);
}

main();