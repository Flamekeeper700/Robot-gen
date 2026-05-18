import { parser } from './parser.js';

export function generateSubsystemCode(subsystemData) {
    const baseTemplate = parser.configs.templates.wpilibSubystem;
    
    let importsSet = new Set();
    let declarationsList = [];
    let constructorsList = [];

    subsystemData.hardware.forEach(device => {
        const typeDef = parser.configs.objects[device.type];
        if (!typeDef) return;

        typeDef.imports.forEach(imp => importsSet.add(imp));

        const declLine = parser.resolveTemplate(typeDef.declaration, { name: device.name });
        declarationsList.push(`    private ${declLine}`);

        const constructorDef = typeDef.constructors.find(c => c.name === device.chosenConstructor);
        if (constructorDef) {
            constructorDef.imports.forEach(imp => importsSet.add(imp));

            const contextMap = { name: device.name, ...device.parameters };
            const signatureLine = parser.resolveTemplate(constructorDef.signature, contextMap);
            constructorsList.push(`        ${signatureLine}`);
        }
    });

    const masterContext = {
        packageRoot: parser.configs.global.packageRoot.default,
        className: subsystemData.className,
        imports: Array.from(importsSet).join('\n'),
        constructors: constructorsList.join('\n'),
        simCode: "// TODO: Add simulation variables"
    };

    let finalCode = parser.resolveTemplate(baseTemplate.template, masterContext);

    const classHeader = `public class ${subsystemData.className} extends SubsystemBase {\n`;
    const joinedDeclarations = declarationsList.join('\n') + '\n';
    finalCode = finalCode.replace(classHeader, classHeader + joinedDeclarations);

    return finalCode;
}