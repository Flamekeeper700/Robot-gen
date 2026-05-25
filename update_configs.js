import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Safely resolves a nested dot-notation path inside an object.
 */
function resolvePath(obj, pathString) {
    if (!pathString || !obj) return obj;
    return pathString.split('.').reduce((acc, part) => {
        return acc && part in acc ? acc[part] : undefined;
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
 * Helper to clean and split parameter strings from method/constructor signatures.
 * e.g., "double, double" -> ["double", "double"]
 */
function parseSignatureParams(paramsString) {
    if (!paramsString) return [];
    return paramsString.split(',').map(p => p.trim()).filter(Boolean);
}

/**
 * Generates comma-separated template placeholders for parameters.
 * e.g., ["double", "int"] -> "${param1}, ${param2}"
 */
function generateParamTemplateString(parameters) {
    return parameters.map((_, i) => `\${param${i + 1}}`).join(', ');
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
    
    for (const item of rootData) {
        let className = resolvePath(item, extractor.classNamePath);
        let rawPackage = item.p || extractor.packageName || "";
        
        if (!className || !rawPackage) continue;
        if (className.includes('/') || className.toLowerCase() === className) continue;

        // Clean generics out of class names
        className = className.replace(/<[^>]*>/g, '').trim();

        if (extractor.packageFilters?.length > 0) {
            const matchesFilter = extractor.packageFilters.some(filter => rawPackage.startsWith(filter));
            if (!matchesFilter) continue; 
        }

        const resolvedImport = `${rawPackage}.${className}`;

        // Assign categorized tags based on name rules
        let category = "utility";
        const lowerName = className.toLowerCase();
        if (lowerName.includes("motor") || className.includes("Talon") || className.includes("Spark")) {
            category = "motor";
        } else if (lowerName.includes("gyro") || className.includes("Pigeon") || className.includes("NavX")) {
            category = "imu";
        }

        classes[className] = {
            name: className,
            package: rawPackage,
            category: category,
            imports: [resolvedImport],
            constructors: [], // Populated dynamically below
            declarationTemplate: `${className} \${instanceName};`,
            methods: {}
        };
        matchedClassesCount++;
    }

    console.log(`   ✅ Extracted ${matchedClassesCount} valid classes. Stitching constructors and methods...`);

    let methodCount = 0;
    let constructorCount = 0;

    if (Array.isArray(rawMembers)) {
        for (const member of rawMembers) {
            const parentClassName = member.c;
            const signature = member.l; // Format: "drive(double,double)" or "SparkMax(int)"

            if (!parentClassName || !classes[parentClassName] || !signature?.includes('(')) continue;

            const [cleanName, paramsPart] = signature.split('(');
            const parameters = parseSignatureParams(paramsPart.replace(')', ''));
            const paramTemplate = generateParamTemplateString(parameters);

            // Check if this signature is actually a constructor
            if (cleanName === parentClassName) {
                classes[parentClassName].constructors.push({
                    parameters: parameters,
                    template: `${parentClassName} \${instanceName} = new ${parentClassName}(${paramTemplate});`
                });
                constructorCount++;
            } else {
                // Otherwise, it's a standard method execution
                classes[parentClassName].methods[cleanName] = {
                    returnType: "void",
                    parameters: parameters,
                    template: `\${instance}.${cleanName}(${paramTemplate});`
                };
                methodCount++;
            }
        }
    }

    // Fallback default constructor if no explicit constructors were bound
    for (const className of Object.keys(classes)) {
        if (classes[className].constructors.length === 0) {
            classes[className].constructors.push({
                parameters: [],
                template: `${className} \${instanceName} = new ${className}();`
            });
        }
    }

    console.log(`   ⚡ Bound ${constructorCount} constructors and ${methodCount} total methods to parent trees.`);
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
            if (Object.keys(translatedClasses).length > 0) {
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
    console.log(`\n📝 Output saved cleanly to: ${outputPath}`);
}

main();