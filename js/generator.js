import { ConfigParser } from './parser.js';

export class CodeGenerator {
    /**
     * Constructs a full subsystem string using values queried out of our parser storage
     */
    generateSubsystemCode(subsystemName, selectedHardwareList) {
        let imports = new Set(["import edu.wpi.first.wpilibj2.command.SubsystemBase;"]);
        let declarations = [];
        let initializations = [];

        selectedHardwareList.forEach(item => {
            // Pull the exact blueprint details from our parser lookup cache
            const meta = ConfigParser.getClassData(item.type);
            
            // If pulling from live definitions, use dynamic meta. 
            // Fallback templates below ensure the engine doesn't crash during development.
            if (meta && meta.imports) {
                meta.imports.forEach(i => imports.add(i));
            } else {
                imports.add(`import ${item.type === 'TalonFX' ? 'com.ctre.phoenix6.hardware.TalonFX' : 'com.revrobotics.CANSparkMax'};`);
                if (item.isCTRE) {
                    imports.add("import com.ctre.phoenix6.configs.CurrentLimitsConfigs;");
                }
            }

            // Populate the structural code strings
            let decl = meta ? meta.declarationTemplate
                .replace("${className}", item.type)
                .replace("${instanceName}", item.varName) : `${item.type} ${item.varName};`;
            declarations.push(`    private final ${decl}`);

            // Pick the appropriate constructor config block
            let init = meta ? meta.constructors[0].template
                .replace("${instanceName}", item.varName)
                .replace("${param}", item.portId) : `${item.varName} = new ${item.type}(${item.portId});`;
            initializations.push(`        ${init}`);

            // Enforce appropriate current limit bounds
            if (item.limit) {
                if (item.isCTRE) {
                    initializations.push(`        CurrentLimitsConfigs currentLimits = new CurrentLimitsConfigs();`);
                    initializations.push(`        currentLimits.SupplyCurrentLimitEnable = true;`);
                    initializations.push(`        currentLimits.SupplyCurrentLimit = ${item.limit};`);
                    initializations.push(`        ${item.varName}.getConfigurator().apply(currentLimits);`);
                } else {
                    initializations.push(`        ${item.varName}.setSmartCurrentLimit(${item.limit});`);
                }
            }
        });

        // Assemble the actual file string layout
        return `package frc.robot.subsystems;\n\n${Array.from(imports).join('\n')}\n\npublic class ${subsystemName} extends SubsystemBase {\n${declarations.join('\n')}\n\n    public ${subsystemName}() {\n${initializations.join('\n')}\n    }\n}`;
    }

    /**
     * Builds and downloads the final robot configuration as a single zip archive
     */
    async downloadProjectZip(subsystemName, hardwareList) {
        if (typeof JSZip === 'undefined') {
            alert("Error: JSZip library failed to load.");
            return;
        }

        const zip = new JSZip();
        const subsystemCode = this.generateSubsystemCode(subsystemName, hardwareList);

        // Map files directly into a standard FRC project structure
        zip.file(`src/main/java/frc/robot/subsystems/${subsystemName}.java`, subsystemCode);
        
        // Trigger a native browser save dialog
        const content = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(content);
        link.download = "robot_code.zip";
        link.click();
    }
}

export const robotGenerator = new CodeGenerator();