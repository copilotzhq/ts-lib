# AgentV2 Native Tools

AgentV2 comes with **14 built-in tools** that provide agents with essential capabilities for real-world tasks. These tools follow the **simplicity principle** of AgentV2 - powerful functionality with clean, easy-to-use interfaces.

## 🔧 Core Tools (5)

### `verbal_pause`
- **Description**: Make a verbal pause and continue in the next turn
- **Use case**: Emphasize key points and allow other participants to process information
- **Parameters**: None

### `ask_question`
- **Description**: Ask a specific question to another agent and get a single answer
- **Use case**: Quick agent-to-agent queries without creating persistent threads
- **Parameters**: `question` (string), `targetAgent` (string), `timeout?` (number)

### `create_thread`
- **Description**: Create a new conversation thread
- **Use case**: Start focused discussions with specific participants
- **Parameters**: `name` (string), `participants` (array), `initialMessage?` (string), `mode?` (string)

### `end_thread`
- **Description**: End/archive a thread with summary
- **Use case**: Cleanly close completed discussions
- **Parameters**: `summary` (string)

### `create_task`
- **Description**: Create a new task for tracking
- **Use case**: Task management and goal tracking
- **Parameters**: `name` (string), `goal` (string)

## 📁 File System Tools (4)

### `read_file`
- **Description**: Read content from local files
- **Security**: Directory traversal protection
- **Parameters**: `path` (string), `encoding?` (string)

### `write_file`
- **Description**: Write content to local files
- **Security**: Directory traversal protection
- **Parameters**: `path` (string), `content` (string), `encoding?` (string), `createDirs?` (boolean)

### `list_directory`
- **Description**: List directory contents
- **Features**: Hidden file filtering, sorted output
- **Parameters**: `path` (string), `showHidden?` (boolean)

### `search_files`
- **Description**: Search for files by pattern
- **Features**: Wildcard support, recursive search
- **Parameters**: `directory?` (string), `pattern` (string), `recursive?` (boolean), `includeHidden?` (boolean)

## 🌐 Network Tools (2)

### `http_request`
- **Description**: Make HTTP requests to APIs
- **Features**: All HTTP methods, headers, timeout, JSON auto-detection
- **Parameters**: `url` (string), `method?` (string), `headers?` (object), `body?` (string), `timeout?` (number)

### `fetch_text`
- **Description**: Simple text fetching from URLs
- **Features**: Simplified version of http_request for text content
- **Parameters**: `url` (string), `timeout?` (number)

## 💻 System Tools (1)

### `run_command`
- **Description**: Execute system commands safely
- **Security**: Dangerous command blocking, timeout protection
- **Parameters**: `command` (string), `args?` (array), `cwd?` (string), `timeout?` (number)

## 🛠️ Utility Tools (2)

### `get_current_time`
- **Description**: Get current date/time in various formats
- **Features**: Multiple formats (ISO, readable, timestamp, etc.)
- **Parameters**: `format?` (string), `timezone?` (string)

### `wait`
- **Description**: Wait for a specified time
- **Use case**: Delays, timing control
- **Parameters**: `seconds` (number)

## 🔒 Security Features

All tools include built-in security measures:
- **Directory traversal protection** (file system tools)
- **Dangerous command blocking** (system tools)
- **Timeout protection** (network and system tools)
- **Input validation** (all tools)
- **Error handling** (graceful failure modes)

## 🚀 Improvements vs AgentV1

### Simplified Interface
- **Before**: Complex plugin system with multiple files and configurations
- **After**: Single registry file with inline tool definitions

### Better Error Handling
- **Before**: Generic error messages
- **After**: Specific, actionable error messages with context

### Enhanced Security
- **Before**: Limited security checks
- **After**: Comprehensive security measures built into each tool

### Streamlined API
- **Before**: Complex ToolDefinition interfaces
- **After**: Simple `RunnableTool` with direct execution

### Performance
- **Before**: Plugin loading overhead
- **After**: Direct tool registration, faster execution

## 📋 Usage Examples

### Agent Configuration
```typescript
const developerAgent: AgentConfig = {
  name: "Developer",
  role: "Software Developer",
  allowedTools: [
    "read_file", "write_file", "list_directory", 
    "http_request", "run_command"
  ],
  // ... other config
};
```

### Tool Execution (Internal)
```typescript
// Tools are automatically called by agents based on their needs
// Example LLM response triggers:
{
  "toolCalls": [
    {
      "function": {
        "name": "read_file",
        "arguments": {
          "path": "package.json"
        }
      }
    }
  ]
}
```

---

**Total: 14 native tools** providing comprehensive functionality for modern AI agents while maintaining the simplicity and security principles of AgentV2. 