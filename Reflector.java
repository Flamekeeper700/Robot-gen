import java.io.FileWriter;
import java.lang.reflect.*;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.*;
import java.util.jar.JarEntry;
import java.util.jar.JarFile;

public class Reflector {
    public static void main(String[] args) {
        if (args.length < 2) {
            System.out.println("Usage: java Reflector.java <path-to-jar> <output-json-path> [package-filter]");
            System.exit(1);
        }

        String jarPath = args[0];
        String outputPath = args[1];
        String packageFilter = args.length > 2 ? args[2] : "";

        StringBuilder json = new StringBuilder("{\n  \"classes\": {\n");
        boolean firstClass = true;

        try (JarFile jarFile = new JarFile(jarPath);
             URLClassLoader cl = new URLClassLoader(new URL[]{new URL("jar:file:" + jarPath + "!/")})) {
            
            Enumeration<JarEntry> entries = jarFile.entries();
            while (entries.hasMoreElements()) {
                JarEntry entry = entries.nextElement();
                if (entry.isDirectory() || !entry.getName().endsWith(".class") || entry.getName().contains("$")) {
                    continue; // Skip directories, inner classes, and non-class files
                }

                // Convert file path to binary class name
                String className = entry.getName().replace('/', '.').substring(0, entry.getName().length() - 6);
                
                if (!packageFilter.isEmpty() && !className.startsWith(packageFilter)) {
                    continue;
                }

                try {
                    Class<?> clazz = cl.loadClass(className);
                    if (!Modifier.isPublic(clazz.getModifiers())) continue;

                    if (!firstClass) json.append(",\n");
                    firstClass = false;

                    appendClassJson(json, clazz);
                } catch (Throwable e) {
                    // Skip classes that fail to load due to missing dependencies
                }
            }

            json.append("\n  }\n}");

            try (FileWriter writer = new FileWriter(outputPath)) {
                writer.write(json.toString());
                System.out.println("✅ Successfully reflected JAR data to: " + outputPath);
            }

        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private static void appendClassJson(StringBuilder json, Class<?> clazz) {
        String simpleName = clazz.getSimpleName();
        String type = clazz.isEnum() ? "enum" : (clazz.isInterface() ? "interface" : "class");
        
        // Determine category matching your current rules
        String category = "utility";
        String lowerName = simpleName.toLowerCase();
        if (lowerName.contains("motor") || simpleName.contains("Talon") || simpleName.contains("Spark") || simpleName.contains("FX") || simpleName.contains("SRX")) {
            category = "motor";
        } else if (lowerName.contains("gyro") || simpleName.contains("Pigeon") || simpleName.contains("NavX") || simpleName.contains("CANcoder")) {
            category = "imu";
        }

        json.append("    \"").append(simpleName).append("\": {\n");
        json.append("      \"name\": \"").append(simpleName).append("\",\n");
        json.append("      \"package\": \"").append(clazz.getPackage().getName()).append("\",\n");
        json.append("      \"type\": \"").append(type).append("\",\n");
        json.append("      \"category\": \"").append(category).append("\",\n");
        json.append("      \"imports\": [\"").append(clazz.getName()).append("\"],\n");

        // Extract Constructors
        json.append("      \"constructors\": [\n");
        Constructor<?>[] constructors = clazz.getConstructors();
        for (int i = 0; i < constructors.length; i++) {
            Constructor<?> c = constructors[i];
            json.append("        {\n          \"parameters\": [");
            Class<?>[] params = c.getParameterTypes();
            for (int j = 0; j < params.length; j++) {
                json.append("\"").append(params[j].getSimpleName()).append("\"");
                if (j < params.length - 1) json.append(", ");
            }
            json.append("]\n        }");
            if (i < constructors.length - 1) json.append(",\n");
        }
        json.append("\n      ],\n");

        // Extract Methods
        json.append("      \"methods\": {\n");
        Method[] methods = clazz.getMethods();
        Map<String, Method> uniqueMethods = new HashMap<>();
        for (Method m : methods) {
            if (Modifier.isPublic(m.getModifiers()) && !m.getDeclaringClass().equals(Object.class)) {
                // Keep unique signatures if overloaded, or just simple name mapping
                uniqueMethods.put(m.getName(), m);
            }
        }
        
        int mIdx = 0;
        for (Map.Entry<String, Method> entry : uniqueMethods.entrySet()) {
            Method m = entry.getValue();
            json.append("        \"").append(m.getName()).append("\": {\n");
            json.append("          \"returnType\": \"").append(m.getReturnType().getSimpleName()).append("\",\n");
            json.append("          \"parameters\": [");
            Class<?>[] params = m.getParameterTypes();
            for (int j = 0; j < params.length; j++) {
                json.append("\"").append(params[j].getSimpleName()).append("\"");
                if (j < params.length - 1) json.append(", ");
            }
            json.append("]\n        }");
            if (++mIdx < uniqueMethods.size()) json.append(",\n");
        }
        json.append("\n      },\n");

        // Extract Fields (Member Variables / Constants) with full Type Safety!
        json.append("      \"fields\": [\n");
        Field[] fields = clazz.getFields(); // Gets public fields including inherited ones
        int fIdx = 0;
        for (Field f : fields) {
            if (Modifier.isPublic(f.getModifiers())) {
                json.append("        { \"name\": \"").append(f.getName())
                    .append("\", \"type\": \"").append(f.getType().getSimpleName()).append("\" }");
                if (++fIdx < fields.length) json.append(",\n");
            }
        }
        json.append("\n      ]\n");
        json.append("    }");
    }
}