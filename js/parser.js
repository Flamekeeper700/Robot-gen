export const ConfigParser = {
    configs: {},

    async loadAllConfigs() {
        try {
            const [types, definitions, templates] = await Promise.all([
                fetch('configs/types.json').then(r => r.json()),
                fetch('configs/definitions.json').then(r => r.json()),
                fetch('configs/templates.json').then(r => r.json())
            ]);

            this.configs = { types, definitions, templates };
            console.log("Configs loaded successfully:", this.configs);
            return this.configs;
        } catch (error) {
            console.error("Failed to load configs from /configs folder:", error);
            throw error;
        }
    },

    getDefinitions() {
        return this.configs.definitions;
    },

    getObjectsByCategory(category) {
        if (!this.configs.definitions || !this.configs.definitions.classes) return [];
        // Extract classes that match the requested category tag
        return Object.values(this.configs.definitions.classes).filter(cls => cls.category === category);
    },

    getClassData(className) {
        if (!this.configs.definitions || !this.configs.definitions.classes) return null;
        return this.configs.definitions.classes[className];
    }
};