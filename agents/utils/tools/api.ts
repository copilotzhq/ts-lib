import type { APIConfig } from "copilotz/agents";

export function getToolNames(openApiSchema: APIConfig['openApiSchema']) {
    return [...Object.keys(openApiSchema.paths).flatMap(path => {
        const pathObj = openApiSchema.paths[path];
        const operationIds: string[] = [];

        // Handle different HTTP methods
        ['get', 'post', 'put', 'delete', 'patch'].forEach(method => {
            if (pathObj[method] && pathObj[method].operationId) {
                operationIds.push(pathObj[method].operationId);
            }
        });

        return operationIds;
    })]
}