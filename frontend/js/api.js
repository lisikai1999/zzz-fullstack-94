const API = {
    async getDefaultLayout() {
        const res = await fetch('/api/layouts/default');
        return res.json();
    },

    async runSimulation(params) {
        const res = await fetch('/api/simulate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
        });
        return res.json();
    },

    async compareSimulation(data) {
        const res = await fetch('/api/simulate/compare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        return res.json();
    },

    async getEvents(runId) {
        const res = await fetch(`/api/simulate/${runId}/events`);
        return res.json();
    },

    async saveLayout(name, config) {
        const res = await fetch('/api/layouts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, config }),
        });
        return res.json();
    },
};
