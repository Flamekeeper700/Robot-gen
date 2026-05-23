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
    }
};