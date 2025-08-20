#!/usr/bin/env -S deno run -A

/**
 * Advanced Stock Research Agent Example
 * 
 * This example demonstrates:
 * 1. Financial research agents with Alpha Vantage API integration
 * 2. Multi-agent collaboration (Research + Analysis + Report Writing)
 * 3. Persistent database connections for server environments
 * 4. Real-time streaming and advanced callbacks
 * 5. OpenAPI schema auto-generation for financial APIs
 */

import { runCLI, type AgentConfig, type APIConfig, type ChatCallbacks } from "copilotz/agents";
import openApiSchema from "./openApiSchema.ts";

function createAlphaVantageConfig(): APIConfig {
    const apiKey = Deno.env.get("DEFAULT_ALPHA_VANTAGE_KEY");
    if (!apiKey) {
        throw new Error("DEFAULT_ALPHA_VANTAGE_KEY environment variable is required. Get your free API key at: https://www.alphavantage.co/support/#api-key");
    }

    return {
        name: "alphavantage",
        description: "Alpha Vantage financial data and market intelligence API",
        openApiSchema: openApiSchema,
        baseUrl: "https://www.alphavantage.co",
        auth: {
            type: 'apiKey',
            key: apiKey,
            name: 'apikey',
            in: 'query'
        },
        timeout: 30
    };
}

// Coordinator Agent - Orchestrates the research process
const coordinatorAgent: AgentConfig = {
    name: "ResearchCoordinator",
    role: "Financial Research Coordinator",
    description: "Coordinates financial research by working with specialist agents",
    personality: "Organized, strategic, and collaborative",
    instructions: `
        You are a senior financial research coordinator who manages research projects by collaborating with specialist agents.
        
        Your role:
        1. Break down research requests into specific tasks
        2. Coordinate with specialist agents to gather information
        3. Synthesize findings into comprehensive reports
        4. Ensure all research is thorough and well-documented
        
        Available specialist agents:
        - @StockResearcher: For gathering raw financial data from Alpha Vantage API
        - @StockAnalyst: For analyzing financial data and providing insights
        - @ReportWriter: For creating professional investment reports
        
        When you need scstlpecific information:
        - Use @mention to bring agents into the conversation
        - Use ask_question tool for direct queries to specialists
        - Use create_thread tool for focused sub-research tasks

        Always coordinate the full research process from data gathering to final report.

        If you are answering a question from another agent, always add a @mention to the agent you are answering to.
    `,
    allowedTools: [
        "ask_question",   // Ask specialists directly
        "create_thread",  // Create focused research threads
        "write_file",     // Save coordination notes
        "read_file"       // Read previous research
    ],
    allowedAgents: ["StockResearcher", "StockAnalyst", "ReportWriter"],
    llmOptions: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.4 // Balanced for coordination and creativity
    }
};

// Research Agent - Gathers raw financial data
const researchAgent: AgentConfig = {
    name: "StockResearcher",
    role: "Financial Data Specialist",
    description: "Specialist in gathering financial data from Alpha Vantage API",
    personality: "Methodical, precise, and data-focused",
    instructions: `
        You are a financial data specialist. You respond when asked to gather specific financial data.
        
        Your expertise:
        - Finding stock symbols for company names
        - Gathering current stock quotes and metrics
        - Retrieving company fundamental data
        - Collecting historical price information
        
        Use the queryFinancialData tool with these functions:
        - SYMBOL_SEARCH: Find symbols (use 'keywords' parameter)
        - GLOBAL_QUOTE: Current price data (use 'symbol' parameter)  
        - OVERVIEW: Company fundamentals (use 'symbol' parameter)
        - TIME_SERIES_DAILY: Historical data (use 'symbol' parameter)
        - INCOME_STATEMENT: Financial statements (use 'symbol' parameter)
        
        Always provide clear, structured data summaries and mention any notable findings.
        When asked, you can also save raw data to files for other agents to analyze.

        If you are answering a question from another agent, always add a @mention to the agent you are answering to.
    `,
    allowedTools: [
        "queryFinancialData", // Alpha Vantage API access
        "write_file",         // Save data for others
        "ask_question"        // Collaborate with other agents
    ],
    allowedAgents: ["ResearchCoordinator", "StockAnalyst", "ReportWriter"],
    llmOptions: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.1 // Low temperature for factual data
    }
};

// Analysis Agent - Interprets financial data 
const analysisAgent: AgentConfig = {
    name: "StockAnalyst",
    role: "Financial Analysis Specialist",
    description: "Specialist in analyzing financial data and providing investment insights",
    personality: "Analytical, insightful, and risk-aware",
    instructions: `
        You are a senior financial analyst specialist. You provide analysis when asked to interpret financial data.
        
        Your expertise:
        - Interpreting stock price trends and patterns
        - Evaluating company fundamentals (P/E, growth, margins)
        - Assessing market conditions and sector performance  
        - Identifying investment risks and opportunities
        - Providing actionable investment insights
        
        When asked to analyze:
        - Request specific data from @StockResearcher if needed
        - Calculate and interpret key financial ratios
        - Compare metrics to industry standards when possible
        - Consider both technical and fundamental factors
        - Always highlight risks and limitations
        - Provide clear, actionable conclusions
        
        You can collaborate with other agents to get additional data or clarify findings.

        If you are answering a question from another agent, always add a @mention to the agent you are answering to.
    `,
    allowedTools: [
        "ask_question",       // Get clarification or additional data
        "read_file",          // Read research data
        "write_file"          // Save analysis results
    ],
    allowedAgents: ["ResearchCoordinator", "StockResearcher", "ReportWriter"],
    llmOptions: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.3 // Balanced for analysis and insights
    }
};

// Report Writing Agent - Creates professional reports
const reportAgent: AgentConfig = {
    name: "ReportWriter",
    role: "Financial Report Specialist",
    description: "Specialist in creating professional financial research reports",
    personality: "Clear, professional, and detail-oriented",
    instructions: `
        You are a professional financial report writing specialist. You create comprehensive reports when requested.
        
        Your expertise:
        - Synthesizing research data and analysis into coherent reports
        - Creating executive summaries for decision-makers
        - Professional formatting with clear structure
        - Including appropriate disclaimers and risk warnings
        - Producing publication-ready investment research
        
        Standard Report Structure:
        # Stock Research Report: [Company Name] ([Symbol])
        ## Executive Summary
        ## Current Market Data  
        ## Fundamental Analysis
        ## Investment Thesis
        ## Risks & Considerations
        ## Conclusion
        
        When asked to create a report:
        - Gather information from @StockResearcher and @StockAnalyst as needed
        - Use ask_question tool to clarify any unclear analysis
        - Include timestamp and data sources
        - Write in professional language for investment professionals
        - Save the final report to a file for distribution

        If you are answering a question from another agent, always add a @mention to the agent you are answering to.
    `,
    allowedTools: [
        "ask_question",       // Get information from other agents
        "read_file",          // Read research and analysis files  
        "write_file"          // Save final reports
    ],
    allowedAgents: ["ResearchCoordinator", "StockResearcher", "StockAnalyst"],
    llmOptions: {
        provider: "openai",
        model: "gpt-4o",
        temperature: 0.5 // Higher creativity for report writing
    }
};

// Advanced callbacks with streaming and monitoring
const stockResearchCallbacks: ChatCallbacks = {

    // Stream content for real-time feedback
    onEvent: (event) => {
        console.log(event);
    },
    onContentStream: (data) => {
        // Only stream content for the report writer to show progress
        Deno.stdout.writeSync(new TextEncoder().encode(data.token));
        if (data.isComplete) {
            Deno.stdout.writeSync(new TextEncoder().encode('\n'));
        }
    },
};


// Main execution
if (import.meta.main) {
    await runCLI({
        participants: ["ResearchCoordinator"],
        agents: [coordinatorAgent, researchAgent, analysisAgent, reportAgent],
        apis: [createAlphaVantageConfig()],
        callbacks: stockResearchCallbacks,
    })
} 