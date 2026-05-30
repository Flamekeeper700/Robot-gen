package robot.testing.src.tools;

import io.github.classgraph.*;
import java.io.FileWriter;
import java.util.*;

public class Reflector {
    public static void main(String[] args) {
        if (args.length < 2) {
            System.out.println("Usage: java tools.Reflector <output-json-path> <package-filters>");
            System.exit(1);
        }

        String outputPath = args[0];
        String[] filters = args[1].split(",");

        StringBuilder json = new StringBuilder("{\n  \"classes\": {\n");
        boolean firstClass = true;

        System.out.println("🧠 ClassGraph Scanning Ecosystem...");

        // ClassGraph scans bytecode directly. It never initializes the classes, 
        // completely avoiding missing dependency crashes.
        try (ScanResult scanResult = new ClassGraph()
                .enableClassInfo()
                .enableMethodInfo()
                .enableFieldInfo()
                .acceptPackages(filters)
                .scan()) {

            for (ClassInfo classInfo : scanResult.getAllClasses()) {
                if (!classInfo.isPublic() || classInfo.getName().contains("$")) continue;

                if (!firstClass) json.append(",\n");
                firstClass = false;

                appendClassJson(json, classInfo);
            }

            json.append("\n  }\n}");

            try (FileWriter writer = new FileWriter(outputPath)) {
                writer.write(json.toString());
                System.out.println("✅ Successfully wrote definition configurations.");
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void appendClassJson(StringBuilder json, ClassInfo clazz) {
        String simpleName = clazz.getSimpleName();
        String type = clazz.isEnum() ? "enum" : (clazz.isInterface() ? "interface" : "class");

        String category = "utility";
        String lowerName = simpleName.toLowerCase();
        if (lowerName.contains("motor") || simpleName.contains("Talon") || simpleName.contains("Spark") || simpleName.contains("FX") || simpleName.contains("SRX")) {
            category = "motor";
        } else if (lowerName.contains("gyro") || simpleName.contains("Pigeon") || simpleName.contains("NavX") || simpleName.contains("CANcoder")) {
            category = "imu";
        }

        json.append("    \"").append(simpleName).append("\": {\n");
        json.append("      \"name\": \"").append(simpleName).append("\",\n");
        json.append("      \"package\": \"").append(clazz.getPackageName()).append("\",\n");
        json.append("      \"type\": \"").append(type).append("\",\n");
        json.append("      \"category\": \"").append(category).append("\",\n");
        json.append("      \"imports\": [\"").append(clazz.getName()).append("\"],\n");

        // Constructors
        json.append("      \"constructors\": [\n");
        MethodInfoList constructors = clazz.getConstructorInfo().filter(MethodInfo::isPublic);
        for (int i = 0; i < constructors.size(); i++) {
            MethodInfo c = constructors.get(i);
            json.append("        {\n          \"parameters\": [");
            MethodParameterInfo[] params = c.getParameterInfo();
            for (int j = 0; j < params.length; j++) {
                json.append("\"").append(params[j].getTypeDescriptor().toString()).append("\"");
                if (j < params.length - 1) json.append(", ");
            }
            json.append("]\n        }");
            if (i < constructors.size() - 1) json.append(",\n");
        }
        json.append("\n      ],\n");

        // Methods
        json.append("      \"methods\": {\n");
        MethodInfoList methods = clazz.getMethodInfo().filter(m -> m.isPublic() && !m.isConstructor());
        
        // Group by name to handle overloads simply for now
        Map<String, MethodInfo> uniqueMethods = new HashMap<>();
        for (MethodInfo m : methods) {
            uniqueMethods.putIfAbsent(m.getName(), m);
        }

        int mIdx = 0;
        for (Map.Entry<String, MethodInfo> entry : uniqueMethods.entrySet()) {
            MethodInfo m = entry.getValue();
            json.append("        \"").append(m.getName()).append("\": {\n");
            json.append("          \"returnType\": \"").append(m.getTypeSignatureOrTypeDescriptor().getResultType().toString()).append("\",\n");
            json.append("          \"parameters\": [");
            MethodParameterInfo[] params = m.getParameterInfo();
            for (int j = 0; j < params.length; j++) {
                json.append("\"").append(params[j].getTypeDescriptor().toString()).append("\"");
                if (j < params.length - 1) json.append(", ");
            }
            json.append("]\n        }");
            if (++mIdx < uniqueMethods.size()) json.append(",\n");
        }
        json.append("\n      },\n");

        // Fields
        json.append("      \"fields\": [\n");
        FieldInfoList fields = clazz.getFieldInfo().filter(FieldInfo::isPublic);
        int fIdx = 0;
        for (FieldInfo f : fields) {
            json.append("        { \"name\": \"").append(f.getName())
                .append("\", \"type\": \"").append(f.getTypeDescriptor().toString()).append("\" }");
            if (++fIdx < fields.size()) json.append(",\n");
        }
        json.append("\n      ]\n");
        json.append("    }");
    }
}