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
 */
function parseSignatureParams(paramsString) {
    if (!paramsString) return [];
    return paramsString.split(',').map(p => p.trim()).filter(Boolean);
}

/**
 * Generates comma-separated template placeholders for parameters.
 */
function generateParamTemplateString(parameters) {
    return parameters.map((_, i) => `\${param${i + 1}}`).join(', ');
}

/**
 * Universal dynamic parser equipped to ingest both raw Javadoc search arrays and standard JSON Vendor Manifests.
 */
function parseSourceDynamically(rootData, config, rawMembers = [], isJavadoc = false) {
    const classes = {};
    const extractor = config.classExtractor;

    if (!rootData || !Array.isArray(rootData)) {
        console.log(`   ❌ [Path Failure] Target root path could not be resolved as an iterable array payload.`);
        return classes;
    }

    console.log(`   ℹ️ Ingesting root collection containing ${rootData.length} entries.`);
    let matchedTypesCount = 0;
    
    for (const item of rootData) {
        // Handle Javadoc naming mappings ('l' inside elements) vs explicit configuration mappings
        let className = isJavadoc ? item.l : resolvePath(item, extractor.classNamePath);
        let rawPackage = isJavadoc ? (item.p || extractor.packageName || "") : (resolvePath(item, extractor.packageNamePath) || extractor.packageName || "");
        
        if (!className || !rawPackage) continue;
        if (className.includes('/')) continue; 

        // Clean generic layouts
        className = className.replace(/<[^>]*>/g, '').trim();

        if (extractor.packageFilters?.length > 0) {
            const matchesFilter = extractor.packageFilters.some(filter => rawPackage.startsWith(filter));
            if (!matchesFilter) continue; 
        }

        const resolvedImport = `${rawPackage}.${className}`;

        // Establish core structural details
        let structuralType = "class"; 
        if (item.g || className.endsWith("Listener") || className.endsWith("Interface") || item.type === "interface") {
            structuralType = "interface";
        }

        let category = "utility";
        const lowerName = className.toLowerCase();
        if (lowerName.includes("motor") || className.includes("Talon") || className.includes("Spark") || className.includes("FX") || className.includes("SRX")) {
            category = "motor";
        } else if (lowerName.includes("gyro") || className.includes("Pigeon") || className.includes("NavX") || className.includes("CANcoder")) {
            category = "imu";
        }

        classes[className] = {
            name: className,
            package: rawPackage,
            type: structuralType,
            category: category,
            imports: [resolvedImport],
            constructors: [], 
            declarationTemplate: `${className} \${instanceName};`,
            methods: {},
            fields: [] 
        };
        matchedTypesCount++;
    }

    console.log(`   ✅ Instantiated ${matchedTypesCount} type configurations. Binding members...`);

    let methodCount = 0;
    let constructorCount = 0;
    let fieldCount = 0;

    // Process tracking components via structural arrays
    if (isJavadoc && Array.isArray(rawMembers)) {
        for (const member of rawMembers) {
            const parentClassName = member.c;
            const signature = member.l;

            if (!parentClassName || !classes[parentClassName]) continue;

            // Extract Fields & potential Enum options
            if (signature && !signature.includes('(')) {
                if (!classes[parentClassName].fields.includes(signature)) {
                    classes[parentClassName].fields.push(signature);
                    fieldCount++;
                }
                continue;
            }

            // Extract Methods & Constructors
            if (signature?.includes('(')) {
                const [cleanName, paramsPart] = signature.split('(');
                const parameters = parseSignatureParams(paramsPart.replace(')', ''));
                const paramTemplate = generateParamTemplateString(parameters);

                if (cleanName === parentClassName && classes[parentClassName].type === "class") {
                    classes[parentClassName].constructors.push({
                        parameters: parameters,
                        template: `${parentClassName} \${instanceName} = new ${parentClassName}(${paramTemplate});`
                    });
                    constructorCount++;
                } else {
                    classes[parentClassName].methods[cleanName] = {
                        returnType: "void",
                        parameters: parameters,
                        template: `\${instance}.${cleanName}(${paramTemplate});`
                    };
                    methodCount++;
                }
            }
        }
    } else if (!isJavadoc) {
        // If it's a standalone JSON manifest (Vendor manifest data), iterate internal parameters
        for (const target of rootData) {
            const name = resolvePath(target, extractor.classNamePath);
            if (!name || !classes[name]) continue;

            // Extract Methods
            const discoveredMethods = resolvePath(target, extractor.methodsPath) || [];
            if (Array.isArray(discoveredMethods)) {
                for (const method of discoveredMethods) {
                    const methodName = typeof method === 'string' ? method : method.name;
                    if (!methodName) continue;
                    
                    const parameters = method.parameters ? method.parameters.map(p => p.type || p) : [];
                    const paramTemplate = generateParamTemplateString(parameters);

                    classes[name].methods[methodName] = {
                        returnType: method.returnType || "void",
                        parameters: parameters,
                        template: `\${instance}.${methodName}(${paramTemplate});`
                    };
                    methodCount++;
                }
            }

            // Extract Fields (supports "fields" path or fallback to "properties")
            const discoveredFields = resolvePath(target, extractor.fieldsPath || "fields") || resolvePath(target, "properties") || [];
            if (Array.isArray(discoveredFields)) {
                for (const field of discoveredFields) {
                    const fieldName = typeof field === 'string' ? field : field.name;
                    if (!fieldName) continue;
                    
                    if (!classes[name].fields.includes(fieldName)) {
                        classes[name].fields.push(fieldName);
                        fieldCount++;
                    }
                }
            }
        }
    }

    // Post Processing & Enum conversion utilizing the native compiler heuristic
    for (const className of Object.keys(classes)) {
        const typeRef = classes[className];
        const isJavaEnum = typeRef.methods["values"] && typeRef.methods["valueOf"];

        if (isJavaEnum) {
            typeRef.type = "enum";
            typeRef.enumValues = [...typeRef.fields];
            typeRef.constructors = [];
            delete typeRef.fields; // Safe to delete here as they have been moved to enumValues
            delete typeRef.methods["values"];
            delete typeRef.methods["valueOf"];
        } else {
            if (typeRef.type === "class" && typeRef.constructors.length === 0) {
                // Fallback default constructor parameters configuration
                typeRef.constructors.push({
                    parameters: [],
                    template: `${className} \${instanceName} = new ${className}();`
                });
            }
            // Removed: delete typeRef.fields; -> This is what was wiping out the member variables.
        }
    }

    console.log(`   ⚡ Bound ${constructorCount} constructors, ${methodCount} methods, and ${fieldCount} fields across structures.`);
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
            let isJavadocIndex = false;

            if (source.isJavadocIndex || source.url.endsWith('type-search-index.js')) {
                isJavadocIndex = true;
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

            const translatedClasses = parseSourceDynamically(rootData, source, rawMembers, isJavadocIndex);
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