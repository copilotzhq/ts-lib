export default {
    "openapi": "3.0.0",
    "info": {
        "title": "Alpha Vantage API",
        "version": "1.0.0",
        "description": "Financial data and market intelligence API"
    },
    "servers": [
        {
            "url": "https://www.alphavantage.co",
            "description": "Alpha Vantage API Server"
        }
    ],
    "paths": {
        "/query": {
            "get": {
                "operationId": "queryFinancialData",
                "summary": "Query Alpha Vantage financial data API",
                "parameters": [
                    {
                        "name": "function",
                        "in": "query",
                        "required": true,
                        "schema": {
                            "type": "string",
                            "enum": ["GLOBAL_QUOTE", "OVERVIEW", "SYMBOL_SEARCH", "TIME_SERIES_DAILY", "INCOME_STATEMENT"]
                        },
                        "description": "API function to call"
                    },
                    {
                        "name": "symbol",
                        "in": "query",
                        "schema": { "type": "string" },
                        "description": "Stock symbol (e.g., AAPL, MSFT)"
                    },
                    {
                        "name": "keywords",
                        "in": "query",
                        "schema": { "type": "string" },
                        "description": "Keywords for symbol search"
                    }
                ]
            }
        }
    },
    "components": {
        "schemas": {
            "GlobalQuote": {
                "type": "object",
                "properties": {
                    "Global Quote": {
                        "type": "object",
                        "properties": {
                            "01. symbol": { "type": "string" },
                            "02. open": { "type": "string" },
                            "03. high": { "type": "string" },
                            "04. low": { "type": "string" },
                            "05. price": { "type": "string" },
                            "06. volume": { "type": "string" },
                            "07. latest trading day": { "type": "string" },
                            "08. previous close": { "type": "string" },
                            "09. change": { "type": "string" },
                            "10. change percent": { "type": "string" }
                        }
                    }
                }
            }
        }
    }
};