class CodeGenerator {
    /**
     * Constructs a full subsystem string using values queried out of our parser storage
     */
    generateSubsystemCode(subsystemName, selectedHardwareList) {
        let imports = new Set(["import edu.wpi.first.wpilibj2.command.SubsystemBase;"]);
        let declarations = [];
        let initializations = [];

        selectedHardwareList.forEach(item => {
            // Pull the exact blueprint details from our parser lookup cache
            const meta = window.frcParser.getClassData(item.type);
            if (!meta) return;

            // Gather required import statement lines dynamically
            if (meta.imports) meta.imports.forEach(i => imports.add(i));

            // Populate the structural code strings using replacement tags
            let decl = meta.declarationTemplate
                .replace("${className}", item.type)
                .replace("${instanceName}", item.varName);
            declarations.push(`    private final ${decl}`);

            // Pick the appropriate constructor config block
            const constructor = meta.constructors[0];
            let init = constructor.template
                .replace("${instanceName}", item.varName)
                .replace("${param}", item.portId);
            initializations.push(`        ${init}`);
        });

        // Assemble the actual file string layout
        return `package frc.robot.subsystems;

${Array.from(imports).join('\n')}

public class ${subsystemName} extends SubsystemBase {
${declarations.join('\n')}

    public ${subsystemName}() {
${initializations.join('\n')}
    }
}`;
    }

    /**
     * Builds and downloads the final robot configuration as a single zip archive
     */
    async downloadProjectZip(subsystemName, hardwareList) {
        const zip = new JSZip(); // Instantiate our CDN dependency
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

window.robotGenerator = new CodeGenerator();