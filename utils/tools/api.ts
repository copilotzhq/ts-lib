import type { API } from "@/interfaces/index.ts";

export function getToolNames(openApiSchema: API['openApiSchema']): string[] {
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