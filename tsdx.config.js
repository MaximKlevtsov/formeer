module.exports = {
    rollup(config, options) {
        const oldExternalFilter = config.external;
        config.external = (id, parentId, isResolved) => id === 'react' || oldExternalFilter(id, parentId, isResolved);

        return config;
    }
};
