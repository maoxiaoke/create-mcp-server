#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";


const server = new Server(
  {
    name: "create-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const exampleProjectStructure = `
<file_summary>
This section contains a summary of this file.

<purpose>
This file contains a packed representation of a MCP server project.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.
</purpose>

<file_format>
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files, each consisting of:
  - File path as an attribute
  - Full contents of the file
</file_format>

<usage_guidelines>
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.
</usage_guidelines>

</file_summary>

<directory_structure>
src/
  index.ts
.gitignore
package.json
README.md
tsconfig.json
</directory_structure>

<files>
This section contains the contents of the repository's files.

<file path="src/index.ts">
#!/usr/bin/env node

/**
 * This is a template MCP server that implements a simple notes system.
 * It demonstrates core MCP concepts like resources and tools by allowing:
 * - Listing notes as resources
 * - Reading individual notes
 * - Creating new notes via a tool
 * - Summarizing all notes via a prompt
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Type alias for a note object.
 */
type Note = { title: string, content: string };

/**
 * Simple in-memory storage for notes.
 * In a real implementation, this would likely be backed by a database.
 */
const notes: { [id: string]: Note } = {
  "1": { title: "First Note", content: "This is note 1" },
  "2": { title: "Second Note", content: "This is note 2" }
};

/**
 * Create an MCP server with capabilities for resources (to list/read notes),
 * tools (to create new notes), and prompts (to summarize notes).
 */
const server = new Server(
  {
    name: "mcp-example",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
      prompts: {},
    },
  }
);

/**
 * Handler for listing available notes as resources.
 * Each note is exposed as a resource with:
 * - A note:// URI scheme
 * - Plain text MIME type
 * - Human readable name and description (now including the note title)
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: Object.entries(notes).map(([id, note]) => ({
      uri: \`note:///\${id}\`,
      mimeType: "text/plain",
      name: note.title,
      description: \`A text note: \${note.title}\`
    }))
  };
});

/**
 * Handler for reading the contents of a specific note.
 * Takes a note:// URI and returns the note content as plain text.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const id = url.pathname.replace(/^\//, '');
  const note = notes[id];

  if (!note) {
    throw new Error(\`Note \${id} not found\`);
  }

  return {
    contents: [{
      uri: request.params.uri,
      mimeType: "text/plain",
      text: note.content
    }]
  };
});

/**
 * Handler that lists available tools.
 * Exposes a single "create_note" tool that lets clients create new notes.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_note",
        description: "Create a new note",
        inputSchema: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Title of the note"
            },
            content: {
              type: "string",
              description: "Text content of the note"
            }
          },
          required: ["title", "content"]
        }
      }
    ]
  };
});

/**
 * Handler for the create_note tool.
 * Creates a new note with the provided title and content, and returns success message.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "create_note": {
      const title = String(request.params.arguments?.title);
      const content = String(request.params.arguments?.content);
      if (!title || !content) {
        throw new Error("Title and content are required");
      }

      const id = String(Object.keys(notes).length + 1);
      notes[id] = { title, content };

      return {
        content: [{
          type: "text",
          text: \`Created note \${id}: \${title}\`
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Handler that lists available prompts.
 * Exposes a single "summarize_notes" prompt that summarizes all notes.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "summarize_notes",
        description: "Summarize all notes",
      }
    ]
  };
});

/**
 * Handler for the summarize_notes prompt.
 * Returns a prompt that requests summarization of all notes, with the notes' contents embedded as resources.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  if (request.params.name !== "summarize_notes") {
    throw new Error("Unknown prompt");
  }

  const embeddedNotes = Object.entries(notes).map(([id, note]) => ({
    type: "resource" as const,
    resource: {
      uri: \`note:///\${id}\`,
      mimeType: "text/plain",
      text: note.content
    }
  }));

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Please summarize the following notes:"
        }
      },
      ...embeddedNotes.map(note => ({
        role: "user" as const,
        content: note
      })),
      {
        role: "user",
        content: {
          type: "text",
          text: "Provide a concise summary of all the notes above."
        }
      }
    ]
  };
});

/**
 * Start the server using stdio transport.
 * This allows the server to communicate via standard input/output streams.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
</file>

<file path=".gitignore">
node_modules/
build/
*.log
.env*
</file>

<file path="package.json">
{
  "name": "mcp-example",
  "version": "0.1.0",
  "description": "This is an example of MCP server using TypeScript",
  "private": true,
  "type": "module",
  "bin": {
    "mcp-example": "./build/index.js"
  },
  "files": [
    "build"
  ],
  "scripts": {
    "build": "tsc && node -e \"require('fs').chmodSync('build/index.js', '755')\"",
    "prepare": "npm run build",
    "watch": "tsc --watch",
    "inspector": "npx @modelcontextprotocol/inspector build/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "0.6.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.24",
    "typescript": "^5.3.3"
  }
}
</file>

<file path="README.md">
# mcp-example MCP Server

This is an example of MCP server using TypeScript

This is a TypeScript-based MCP server that implements a simple notes system. It demonstrates core MCP concepts by providing:

- Resources representing text notes with URIs and metadata
- Tools for creating new notes
- Prompts for generating summaries of notes

## Features

### Resources
- List and access notes via \`note://\` URIs
- Each note has a title, content and metadata
- Plain text mime type for simple content access

### Tools
- \`create_note\` - Create new text notes
  - Takes title and content as required parameters
  - Stores note in server state

### Prompts
- \`summarize_notes\` - Generate a summary of all stored notes
  - Includes all note contents as embedded resources
  - Returns structured prompt for LLM summarization

## Development

Install dependencies:
\`\`\`bash
npm install
\`\`\`

Build the server:
\`\`\`bash
npm run build
\`\`\`

For development with auto-rebuild:
\`\`\`bash
npm run watch
\`\`\`

## Installation

To use with Claude Desktop, add the server config:

On MacOS: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
On Windows: \`%APPDATA%/Claude/claude_desktop_config.json\`

\`\`\`json
{
  "mcpServers": {
    "mcp-example": {
      "command": "/path/to/mcp-example/build/index.js"
    }
  }
}
\`\`\`

### Debugging

Since MCP servers communicate over stdio, debugging can be challenging. We recommend using the [MCP Inspector](https://github.com/modelcontextprotocol/inspector), which is available as a package script:

\`\`\`bash
npm run inspector
\`\`\`

The Inspector will provide a URL to access debugging tools in your browser.
</file>

<file path="tsconfig.json">
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "./build",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
</file>

</files>
`

const MCP_Server_Development_Protocol = () =>  `
  The Model Context Protocol (MCP) enables communication between the system and locally running MCP servers that provide additional tools and resources to extend your capabilities. You have the ability to create an MCP server.
  You MUST follow the following instructions when creating an MCP server:

  ## Step 1: Planning
  - You MUST plan out the resources and tools that you will need for your MCP server.
  - What API/service will it use?

  ## Step 2: Implementation

  ### Example MCP Server:
  Refer to the example project structure below for a list of files that you will need to create.

  ${exampleProjectStructure}

  ### Core Implementation

  - Implement the resources and tools that you planned out in step 1
  - Implement comprehensive logging
    \`\`\`typescript
    console.error('[Setup] Initializing server...');
    console.error('[API] Request to endpoint:', endpoint);
    console.error('[Error] Failed with:', error);
    \`\`\`

  - Add type definitions
  - Handle errors with context
  - Whenever you need an environment variable such as an API key to configure the MCP server, walk the user through the process of getting the key. For example, they may need to create an account and go to a developer dashboard to generate the key. Provide step-by-step instructions and URLs to make it easy for the user to retrieve the necessary information. Then use the ask_followup_question tool to ask the user for the key, in this case the OpenWeather API key.

  ### Installation
  - Before running the server, you MUST install the dependencies and build the server.
    \`\`\`bash
    npm install
    npm run build
    \`\`\`

  ## Step 3: Testing
  <thinking>
  BEFORE completing, I MUST verify:
  □ Have I tested EVERY tool?
  □ Have I confirmed success from the user for each test?
  □ Have I documented the test results?

  If ANY answer is "no", I MUST NOT complete the task.
  </thinking>

  - Test each tool with valid inputs
  - Verify output format is correct
  - DO NOT PROCEED UNTIL ALL TOOLS TESTED
`

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "create_mcp_server",
        description: "Create a new MCP server scaffold",
        inputSchema: {
          type: "object",
          properties: {
          },
          required: []
        }
      }
    ]
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "create_mcp_server": {
      return {
        content: [{
          type: "text",
          text: MCP_Server_Development_Protocol()
        }]
      };
    }

    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  console.log("Starting MCP server...");
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
