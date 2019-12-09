const packageJson = require('./package.json');
const peerDependencies = Object.keys(packageJson.peerDependencies || {}) || [];

module.exports = {
    rollup(config) {
        const oldExternalFilter = config.external;
        config.external = (id, parentId, isResolved) => peerDependencies.includes(id) || oldExternalFilter(id, parentId, isResolved);

        return config;
    }
};
