# Advanced Examples

This directory contains sophisticated examples that demonstrate advanced patterns and real-world applications of the Copilotz Agent framework.

## 📈 Stock Research Agent (`stock-researcher.ts`)

A comprehensive financial research system demonstrating enterprise-grade agent collaboration.

### Features Demonstrated

#### 🤖 **Multi-Agent Collaboration**
- **ResearchCoordinator** - Orchestrates the research process and coordinates with specialists
- **StockResearcher** - Specialist in gathering financial data via Alpha Vantage API
- **StockAnalyst** - Specialist in interpreting data and providing investment insights  
- **ReportWriter** - Specialist in creating professional research reports

#### 🌐 **API Integration Patterns**
- OpenAPI schema auto-generation for Alpha Vantage API
- Transparent API key authentication via AuthConfig
- Error handling and rate limit management
- Multiple API endpoints (quotes, fundamentals, search)

#### 💾 **Database Persistence**
- Persistent database connections for server environments
- Connection reuse across multiple requests
- Optimized for low-latency production deployments

#### 📡 **Advanced Streaming & Callbacks**
- Real-time content streaming during report generation
- Comprehensive API monitoring and logging
- Tool execution monitoring and debugging
- Professional progress feedback to users

#### 🔧 **Production Patterns**
- Environment variable configuration
- CLI interface with usage examples
- Graceful error handling and validation
- Professional report formatting and structure

### Usage

```bash
# Set your Alpha Vantage API key
export DEFAULT_ALPHA_VANTAGE_KEY="your-api-key-here"

# Research single company
deno run --allow-all stock-researcher.ts "Apple Inc"

# Research multiple companies  
deno run --allow-all stock-researcher.ts "Apple" "Microsoft" "Google"

# Run example scenarios
deno run --allow-all stock-researcher.ts examples

# With custom database
export DATABASE_URL="postgresql://user:pass@host/db"
deno run --allow-all stock-researcher.ts "TSLA" "NVDA"
```

### Architecture

```
                    ┌──────────────────────┐
                    │ ResearchCoordinator  │
                    │                      │
                    │ • Orchestrates flow  │
                    │ • Coordinates tasks  │ 
                    │ • Manages specialists │
                    └──────────────────────┘
                              │
                    ┌─────────┼─────────┐
                    │         │         │
                    ▼         ▼         ▼
         ┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐
         │ StockResearcher │ │  StockAnalyst    │ │  ReportWriter   │
         │                 │ │                  │ │                 │
         │ • Symbol search │ │ • Trend analysis │ │ • Report format │
         │ • Stock quotes  │ │ • Fundamentals   │ │ • Executive sum │
         │ • Company data  │ │ • Risk assess    │ │ • File output   │
         └─────────────────┘ └──────────────────┘ └─────────────────┘
                  │                    │                    │
                  ▼                    ▼                    ▼
         ┌─────────────────┐ ┌──────────────────┐ ┌─────────────────┐
         │ Alpha Vantage   │ │   Analysis DB    │ │  Report Files   │
         │ Financial API   │ │     Storage      │ │   (.md files)   │
         └─────────────────┘ └──────────────────┘ └─────────────────┘

Collaboration Methods:
- @mentions to bring agents into conversation (auto-continues thread)
- ask_question tool for direct queries
- create_thread tool for focused sub-tasks
- Conversational back-and-forth like team chat
- Automatic continuation when agents mention each other
```

### Key Learning Points

1. **API Integration** - How to create OpenAPI schemas and auto-generate tools
2. **Authentication** - Transparent API key management with AuthConfig
3. **Database Patterns** - Persistent connections and configuration storage  
4. **Agent Collaboration** - Conversational teamwork with specialists via @mentions and tools
5. **Error Handling** - Robust error management and user feedback
6. **Streaming** - Real-time content delivery and progress monitoring
7. **Production Deployment** - Environment configuration and server patterns

### Getting Alpha Vantage API Key

1. Visit [Alpha Vantage](https://www.alphavantage.co/support/#api-key)
2. Sign up for a free account
3. Get your API key from the dashboard
4. Set the `DEFAULT_ALPHA_VANTAGE_KEY` environment variable

### Example Output

The system generates comprehensive research reports with:

- **Executive Summary** - Key findings and recommendations
- **Current Market Data** - Real-time prices and metrics
- **Fundamental Analysis** - Financial ratios and company health
- **Investment Thesis** - Reasoned investment recommendations  
- **Risk Assessment** - Potential risks and limitations
- **Professional Formatting** - Clean, readable report structure

---

This example showcases the framework's ability to build sophisticated, production-ready agent systems that can handle real-world business workflows with enterprise-grade reliability and performance. 