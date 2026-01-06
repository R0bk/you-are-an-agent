/**
 * Level 5: Agent Coding (WebVM)
 *
 * The player acts as a coding agent that must:
 * 1. Run tests to discover a bug
 * 2. Read and understand the buggy code
 * 3. Write a fix
 * 4. Verify the fix passes tests
 *
 * Tools: shell(), read_file(), write_file()
 */

import { Level } from '../../types';
import { webvmService } from '../../services/webvmService';
import { parseToolCall } from './parser';

export * from './parser';

const REALISTIC_TOOLS = [
  {
    "name": "shell",
    "title": "Execute Shell Command",
    "description": "Executes a shell command in the environment (Arch Linux). Returns stdout/stderr.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "command": { "type": "string", "description": "The bash command to execute." }
      },
      "required": ["command"]
    }
  },
  {
    "name": "read_file",
    "title": "Read File",
    "description": "Reads and returns the contents of a file at the specified path.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": { "type": "string", "description": "Path to the file to read." }
      },
      "required": ["path"]
    }
  },
  {
    "name": "write_file",
    "title": "Write File",
    "description": "Writes content to a file at the specified path, overwriting it if it exists.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "path": { "type": "string", "description": "Absolute or relative file path." },
        "content": { "type": "string", "description": "The file content." }
      },
      "required": ["path", "content"]
    }
  }
];

export const level5: Level = {
  id: 5,
  title: "Agent Coding",
  description: "You are a coding agent. A bug has been reported in the billing system. Run the tests, find the bug, and fix it.",
  systemPrompt: "You are a Senior Python Engineer. You have access to an Arch Linux shell.\n\nEnvironment:\n- Python installed (VM)\n- Project root: /root\n- Test runner: `python3 run_tests.py`",
  userPrompt: "Users are reporting that the total calculation is wrong. It seems to be reducing the amount instead of adding tax. Please investigate and fix the bug in `src/billing.py`.",
  tools: ["shell(command: string)", "read_file(path: string)", "write_file(path: string, content: string)"],
  realisticTools: REALISTIC_TOOLS,
  placeholder: 'shell("python3 run_tests.py")',
  hint: "Start by exploring the file system or running the test suite.",

  validate: async (input, history) => {
    const parseResult = parseToolCall(input);

    if (!parseResult.success || !parseResult.call) {
      return {
        status: 'FAIL',
        message: parseResult.error || 'Invalid tool call syntax',
        failType: 'TOOL_ERROR'
      };
    }

    const { tool, args } = parseResult.call;

    switch (tool) {
      case 'shell': {
        const command = args.command as string;
        try {
          const output = await webvmService.executeShell(command);

          // Check for Python test success
          if (command.includes('run_tests.py')) {
            if (output.includes('OK')) {
              return {
                status: 'SUCCESS',
                message: "Tests passed! Deployment pipeline triggered.",
                toolOutput: output
              };
            }
            if (output.includes('FAIL') || output.includes('Traceback')) {
              return {
                status: 'INTERMEDIATE',
                message: "Tests failed",
                toolOutput: output
              };
            }
          }

          return {
            status: 'INTERMEDIATE',
            message: "Shell executed",
            toolOutput: output || "[No output]"
          };
        } catch (e) {
          return {
            status: 'FAIL',
            message: "VM Execution Failed: " + e,
            failType: 'TOOL_ERROR'
          };
        }
      }

      case 'read_file': {
        const path = args.path as string;
        try {
          // Use cat to read the file
          const output = await webvmService.executeShell(`cat "${path}"`);
          return {
            status: 'INTERMEDIATE',
            message: "File read",
            toolOutput: output || "[Empty file]"
          };
        } catch (e) {
          return {
            status: 'FAIL',
            message: "Failed to read file: " + e,
            failType: 'TOOL_ERROR'
          };
        }
      }

      case 'write_file': {
        const path = args.path as string;
        const content = args.content as string;
        try {
          await webvmService.writeFile(path, content);
          return {
            status: 'INTERMEDIATE',
            message: "File saved to disk.",
            toolOutput: `[WebVM FS] Wrote ${content.length} bytes to ${path}`
          };
        } catch (e) {
          return {
            status: 'FAIL',
            message: "VM Connection Error: " + e,
            failType: 'TOOL_ERROR'
          };
        }
      }

      default:
        return {
          status: 'FAIL',
          message: "Unknown tool",
          failType: 'TOOL_ERROR'
        };
    }
  },

  successMessage: "Patch applied. CI/CD Pipeline: [PASSED]"
};
