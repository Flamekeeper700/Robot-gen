import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Resolves dot-notation paths for nested object access.
 */
function resolvePath(obj, pathString) {
    if (!pathString || !obj) return obj;
    return pathString.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
}

/**
 * Extracts clean JSON from JS files containing variable assignments.
 */
function cleanJavascriptJson(text) {
    const start = Math.max(text.indexOf('{'), text.indexOf('['));
    const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
    return JSON.parse(text.substring(start, end + 1));
}

function parseSourceDynamically(rootData, config, rawMembers = []) {
    const classes = {};
    const { classExtractor: extr } = config;

    if (!Array.isArray(rootData)) return classes;

    // First pass: Initialize class objects
    rootData.forEach((item) => {
        let name = resolvePath(item, extr.classNamePath);
        let pkg = item.p || extr.packageName || "";
        
        if (!name || name.includes('/') || name.toLowerCase() === name) return;
        name = name.replace(/<[^>]*>/g, '').trim();

        if (extr.packageFilters?.length > 0 && !extr.packageFilters.some(f => pkg.startsWith(f))) return;

        classes[name] = {
            name,
            package: pkg,
            imports: [`${pkg}.${name}`],
            constructors: [],
            methods: {}
        };
    });

    // Second pass: Populate members (methods and constructors)
    rawMembers.forEach(member => {
        const parent = member.c;
        const entry = member.l; // Format: name(type,type)
        if (!parent || !classes[parent] || !entry.includes('(')) return;

        const [name, rawParams] = entry.split('(');
        const params = rawParams.replace(')', '').split(',').filter(p => p !== "").map(p => p.trim());
        const paramTemplate = params.map((_, i) => `\${p${i + 1}}`).join(', ');

        if (name === parent) {
            // It's a constructor
            classes[parent].constructors.push({
                parameters: params,
                template: `${parent} instance = new ${parent}(${paramTemplate});`
            });
        } else {
            // It's a method
            classes[parent].methods[name] = {
                parameters: params,
                template: `\${instance}.${name}(${paramTemplate});`
            };
        }
    });

    return classes;
}

async function main() {
    const configsDir = path.join(process.cwd(), 'configs');
    const sourcesPath = path.join(configsDir, 'sources.json');
    
    if (!fs.existsSync(sourcesPath)) return console.error('Missing sources.json');

    const { sources } = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
    const output = { metadata: { generatedAt: new Date().toISOString() }, classes: {} };

    for (const source of sources) {
        try {
            let rootData = null, rawMembers = [];
            
            const typeRes = await fetch(source.url);
            rootData = cleanJavascriptJson(await typeRes.text());

            if (source.isJavadocIndex) {
                const memberUrl = source.url.replace('type-search-index.js', 'member-search-index.js');
                const memberRes = await fetch(memberUrl);
                if (memberRes.ok) rawMembers = cleanJavascriptJson(await memberRes.text());
            }

            Object.assign(output.classes, parseSourceDynamically(rootData, source, rawMembers));
            console.log(`Processed: ${source.name}`);
        } catch (e) {
            console.error(`Failed to process ${source.name}:`, e.message);
        }
    }

    fs.writeFileSync(path.join(configsDir, 'definitions.json'), JSON.stringify(output, null, 2));
}

main();