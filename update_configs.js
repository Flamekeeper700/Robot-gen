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
        
        // Resolve package identity
        let rawPackage = item.p || extractor.packageName || "";
        if (!className || !rawPackage) return;

        // Skip non-class utility boundaries or nesting anomalies
        if (className.includes('/') || className.toLowerCase() === className) return;

        // Strip HTML formatting tags often found inside Javadoc headers
        className = className.replace(/<[^>]*>/g, '').trim();

        // GLOBAL PACKAGE FILTERING
        if (extractor.packageFilters && extractor.packageFilters.length > 0) {
            const matchesFilter = extractor.packageFilters.some(filter => rawPackage.startsWith(filter));
            if (!matchesFilter) return; 
        }

        const resolvedImport = `${rawPackage}.${className}`;

        // Tag hardware category defaults for UI binding
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

    // STITCHING PHASE: Map functions out of the standalone member registry into our classes
    let methodCount = 0;
    if (Array.isArray(rawMembers)) {
        rawMembers.forEach(member => {
            // In Javadocs, 'c' holds the class container name, and 'l' holds the method/field name
            const parentClassName = member.c;
            const methodName = member.l;

            // Make sure this member belongs to a class we matched and is a valid method (not an field/enum value)
            if (parentClassName && classes[parentClassName] && methodName && methodName.includes('(')) {
                // Strip the parentheses signature from the key lookup name
                const cleanMethodName = methodName.split('(')[0];
                
                // Avoid capturing constructor methods
                if (cleanMethodName === parentClassName) return;

                classes[parentClassName].methods[cleanMethodName] = {
                    returnType: "void", // Default fallback
                    parameters: [],     // Extracted dynamic parameters can be loaded here if needed
                    template: `\${instance}.${cleanMethodName}();`
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
                console.log(`🌐 Ingesting Javadoc Dual Endpoint Structure...`);
                
                // 1. Fetch Types
                console.log(`   👉 Fetching Types: ${source.url}`);
                const typeRes = await fetch(source.url);
                const typeText = await typeRes.text();
                rootData = cleanJavascriptJson(typeText);

                // 2. Derive and Fetch Members (Swap out filename in URL)
                const memberUrl = source.url.replace('type-search-index.js', 'member-search-index.js');
                console.log(`   👉 Fetching Members: ${memberUrl}`);
                const memberRes = await fetch(memberUrl);
                
                if (memberRes.ok) {
                    const memberText = await memberRes.text();
                    rawMembers = cleanJavascriptJson(memberText);
                } else {
                    console.warn(`   ⚠️ Warning: Member endpoint could not be found. Skipping method ingestion.`);
                }
            } else {
                // Handle standard direct flat JSON manifests
                console.log(`🌐 Fetching Direct JSON Schema: ${source.url}`);
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
            } else {
                console.log(`   ⚠️ Filter Pass Finished: 0 classes matched package definitions.`);
            }

        } catch (err) {
            console.warn(`   ❌ Critical Exception executing pipeline for "${source.name}":`, err.message);
        }
    }

    console.log(`\n--------------------------------------------------`);
    
    if (!fs.existsSync(configsDir)) {
        fs.mkdirSync(configsDir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(masterDefinitions, null, 2), 'utf-8');
    console.log(`📝 Output saved cleanly to: ${outputPath}`);
    console.log(`🏁 Complete. Target APIs processed: [${masterDefinitions.metadata.apisProcessed.join(', ')}]\n`);
}

main();