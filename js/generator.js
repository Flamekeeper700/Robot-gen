export class Generator {
    constructor(definitions, templates, types) {
        this.definitions = definitions;
        this.templates = templates;
        this.types = types;
    }

    /**
     * Universal class generator. Replaces the old subsystem-only generator
     * so it can be used for RobotContainer, Constants, and framework files.
     */
    generateClass(className, packageName, imports, fields, init, methods, framework) {
        let template = this.templates.classTemplate.join('\n');
        
        // Inject framework-specific architecture
        let classDefinition = `public class ${className}`;
        let frameworkImports = [...imports];

        if (framework === "command-v3") {
            frameworkImports.push("import edu.wpi.first.wpilibj2.command.SubsystemBase;");
            classDefinition += " extends SubsystemBase";
        }

        template = template.replace('${package}', packageName);
        template = template.replace('${imports}', frameworkImports.join('\n'));
        template = template.replace('public class ${className}', classDefinition);
        template = template.replace(/\$\{className\}/g, className);
        
        template = template.replace('${fields}', fields.join('\n    '));
        template = template.replace('${initialization}', init.join('\n        '));
        template = template.replace('${methods}', methods.join('\n    '));
        
        return template;
    }

    async generateProjectZip(subsystemConfigs, framework) {
        const zip = new JSZip();
        const basePkg = "frc.robot";
        const srcFolder = zip.folder(`src/main/java/frc/robot/subsystems`);

        // Iterate over the tab configurations to generate separate files
        for (const config of subsystemConfigs) {
            // Context assembly would pull from definitions.json based on config.hardware
            const imports = ["import com.ctre.phoenix6.hardware.TalonFX;"]; // Example populated from parser
            const fields = [`private final TalonFX motor = new TalonFX(1);`];
            const inits = [`motor.getConfigurator().apply(new TalonFXConfiguration());`];
            
            const classCode = this.generateClass(
                config.className,
                `${basePkg}.subsystems`,
                imports,
                fields,
                inits,
                [], 
                framework
            );
            
            srcFolder.file(`${config.className}.java`, classCode);
        }

        const content = await zip.generateAsync({ type: "blob" });
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = "ROBOGEN_Export.zip";
        a.click();
    }
}