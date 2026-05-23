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
 * Custom extractor built to handle standard JSON and heavily cross-referenced Javadoc indices.
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

    // Capture Javadoc package maps if they exist to decode numerical lookups
    const packageLookups = rawData.packages || [];

    console.log(`   ℹ️ Ingesting root collection containing ${rootData.length} entries.`);
    let matchedClassesCount = 0;
    
    rootData.forEach((item) => {
        let className = resolvePath(item, extractor.classNamePath);
        
        // Resolve package identity
        let rawPackage = "";
        if (item.p !== undefined) {
            // If it's a number, look it up in the packages array; otherwise use the string directly
            if (typeof item.p === 'number' && packageLookups[item.p]) {
                rawPackage = packageLookups[item.p].p || "";
            } else {
                rawPackage = item.p;
            }
        }

        // Fallback to configured default if data map is flat
        if (!rawPackage) rawPackage = extractor.packageName || "";
        if (!className || !rawPackage) return;

        // Skip non-class utility boundaries or nesting anomalies
        if (className.includes('/') || className.toLowerCase() === className) return;

        // Strip HTML character formatting often found inside Javadoc index headers
        className = className.replace(/<[^>]*>/g, '').trim();

        // GLOBAL PACKAGE FILTERING
        if (extractor.packageFilters && extractor.packageFilters.length > 0) {
            const matchesFilter = extractor.packageFilters.some(filter => rawPackage.startsWith(filter));
            if (!matchesFilter) return; // Ignore class if it falls outside our target filters
        }

        const resolvedImport = `${rawPackage}.${className}`;

        classes[className] = {
            package: rawPackage,
            imports: [resolvedImport],
            constructors: [{ parameters: [] }],
            methods: {}
        };
        matchedClassesCount++;

        // Extract methods array block
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

    console.log(`   ✅ Extracted ${matchedClassesCount} valid classes matching package rules.`);
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
        console.log(`🌐 Target URL: ${source.url}`);
        
        try {
            const res = await fetch(source.url);
            
            if (!res.ok) {
                console.warn(`   ❌ Network Error: Remote endpoint dropped connection with status: ${res.status}`);
                continue;
            }

            let rawData;
            
            // Handle Javadoc .js bundle asset files
            if (source.isJavadocIndex || source.url.endsWith('.js')) {
                console.log("   ℹ️ Analyzing response stream as an integrated JavaScript script index layout...");
                const textData = await res.text();
                
                // Track absolute JSON outer boundaries
                const jsonStart = textData.indexOf('{');
                const jsonEnd = textData.lastIndexOf('}');
                
                if (jsonStart === -1 || jsonEnd === -1) {
                    console.warn("   ❌ Structural Parsing Error: script index could not find matching brace layouts.");
                    continue;
                }
                
                const sanitizedJson = textData.substring(jsonStart, jsonEnd + 1);
                rawData = JSON.parse(sanitizedJson);
            } else {
                rawData = await res.json();
            }

            console.log(`   📥 Payload compiled safely (${JSON.stringify(rawData).length} bytes).`);
            
            const translatedClasses = parseSourceDynamically(rawData, source);
            const classCount = Object.keys(translatedClasses).length;

            if (classCount > 0) {
                Object.assign(masterDefinitions.classes, translatedClasses);
                masterDefinitions.metadata.apisProcessed.push(source.name);
                console.log(`   🎉 Successfully populated ${classCount} class entries.`);
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