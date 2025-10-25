type Base64Content = { key: string, value: string };


export function sanitizeBase64DataUrl(
    data: unknown,
    path: string = '',
    content: Base64Content[] = []
): { data: unknown, content: Base64Content[] } {
    const base64DataUrlRegex = /^data:image\/\w+;base64,/;

    let _data = data;

    // Try to parse as JSON if it's a string and not already an object/array
    if (typeof _data === 'string') {
        try {
            const parsed = JSON.parse(_data);
            _data = parsed;
        } catch {
            // If not JSON, leave as is
        }
    }

    // If it's an array, process each element
    if (Array.isArray(_data)) {
        const arrResult: unknown[] = [];
        let arrContent: Base64Content[] = [];
        _data.forEach((item, idx) => {
            const { data: itemData, content: itemContent } = sanitizeBase64DataUrl(item, `${path}[${idx}]`, []);
            arrResult.push(itemData);
            arrContent = arrContent.concat(itemContent);
        });
        return { data: arrResult, content: content.concat(arrContent) };
    }

    // If it's an object, process each key
    if (_data && typeof _data === 'object' && !Array.isArray(_data)) {
        // Make a shallow copy to avoid mutating input
        const objCopy: Record<string, unknown> = { ...(_data as Record<string, unknown>) };
        let objContent: Base64Content[] = [];
        for (const key of Object.keys(objCopy)) {
            const value = objCopy[key];
            if (typeof value === 'string' && base64DataUrlRegex.test(value)) {
                objContent.push({ key: path ? `${path}.${key}` : key, value });
                delete objCopy[key];
            } else if (typeof value === 'object' && value !== null) {
                const { data: nestedData, content: nestedContent } = sanitizeBase64DataUrl(
                    value,
                    path ? `${path}.${key}` : key,
                    []
                );
                objCopy[key] = nestedData;
                objContent = objContent.concat(nestedContent);
            }
        }
        return { data: objCopy, content: content.concat(objContent) };
    }

    // For primitives or unhandled types, just return as is
    return { data: _data, content };
}