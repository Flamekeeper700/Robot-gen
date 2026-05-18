class RoboGenParser {
    constructor() {
        this.configs = {
            baseTypes: null,
            global: null,
            objects: null,
            templates: null
        };
    }

    async loadAllConfigs() {
        try {
            const [baseTypes, global, objects, templates] = await Promise.all([
                fetch('configs/baseTypes.json').then(r => r.json()),
                fetch('configs/global.json').then(r => r.json()),
                fetch('configs/objects.json').then(r => r.json()),
                fetch('configs/templates.json').then(r => r.json())
            ]);

            this.configs.baseTypes = baseTypes;
            this.configs.global = global;
            this.configs.objects = objects;
            this.configs.templates = templates;

            console.log("Configs successfully loaded and cached!", this.configs);
        } catch (error) {
            console.error("Failed to load configuration files:", error);
        }
    }

    resolveTemplate(templateArray, context) {
        let templateString = Array.isArray(templateArray) ? templateArray.join('') : templateArray;
        
        return templateString.replace(/\{\{(\w+)\}\}/g, (match, key) => {
            return context[key] !== undefined ? context[key] : match;
        });
    }
}

export const parser = new RoboGenParser();