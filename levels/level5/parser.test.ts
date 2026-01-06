import { describe, it, expect } from 'vitest';
import { parseToolCall, processEscapeSequences } from './parser';

describe('parseToolCall', () => {
  describe('shell', () => {
    it('parses shell("command")', () => {
      const result = parseToolCall('shell("ls -la")');
      expect(result.success).toBe(true);
      expect(result.call?.tool).toBe('shell');
      expect(result.call?.args.command).toBe('ls -la');
    });

    it('parses shell with single quotes', () => {
      const result = parseToolCall("shell('echo hello')");
      expect(result.success).toBe(true);
      expect(result.call?.args.command).toBe('echo hello');
    });

    it('parses shell with object syntax', () => {
      const result = parseToolCall('shell({ command: "python3 run_tests.py" })');
      expect(result.success).toBe(true);
      expect(result.call?.args.command).toBe('python3 run_tests.py');
    });

    it('parses shell with JSON object syntax', () => {
      const result = parseToolCall('shell({ "command": "cat file.txt" })');
      expect(result.success).toBe(true);
      expect(result.call?.args.command).toBe('cat file.txt');
    });

    it('handles commands with special characters', () => {
      const result = parseToolCall('shell("grep -r \\"pattern\\" .")');
      expect(result.success).toBe(true);
      expect(result.call?.args.command).toBe('grep -r "pattern" .');
    });

    it('handles commands with pipes', () => {
      const result = parseToolCall('shell("ls -la | grep test")');
      expect(result.success).toBe(true);
      expect(result.call?.args.command).toBe('ls -la | grep test');
    });

    it('fails without argument', () => {
      const result = parseToolCall('shell()');
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires');
    });

    it('fails with empty string', () => {
      const result = parseToolCall('shell("")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty');
    });

    it('fails with unquoted argument', () => {
      const result = parseToolCall('shell(ls)');
      expect(result.success).toBe(false);
    });
  });

  describe('read_file', () => {
    it('parses read_file("path")', () => {
      const result = parseToolCall('read_file("src/billing.py")');
      expect(result.success).toBe(true);
      expect(result.call?.tool).toBe('read_file');
      expect(result.call?.args.path).toBe('src/billing.py');
    });

    it('parses read_file with single quotes', () => {
      const result = parseToolCall("read_file('/etc/passwd')");
      expect(result.success).toBe(true);
      expect(result.call?.args.path).toBe('/etc/passwd');
    });

    it('parses read_file with object syntax', () => {
      const result = parseToolCall('read_file({ path: "config.json" })');
      expect(result.success).toBe(true);
      expect(result.call?.args.path).toBe('config.json');
    });

    it('handles paths with spaces', () => {
      const result = parseToolCall('read_file("my file.txt")');
      expect(result.success).toBe(true);
      expect(result.call?.args.path).toBe('my file.txt');
    });

    it('fails without argument', () => {
      const result = parseToolCall('read_file()');
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires');
    });

    it('fails with empty path', () => {
      const result = parseToolCall('read_file("")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty');
    });
  });

  describe('write_file', () => {
    it('parses write_file("path", "content")', () => {
      const result = parseToolCall('write_file("test.txt", "hello world")');
      expect(result.success).toBe(true);
      expect(result.call?.tool).toBe('write_file');
      expect(result.call?.args.path).toBe('test.txt');
      expect(result.call?.args.content).toBe('hello world');
    });

    it('parses write_file with single quotes', () => {
      const result = parseToolCall("write_file('test.txt', 'content here')");
      expect(result.success).toBe(true);
      expect(result.call?.args.path).toBe('test.txt');
      expect(result.call?.args.content).toBe('content here');
    });

    it('parses write_file with object syntax', () => {
      const result = parseToolCall('write_file({ path: "test.py", content: "print(42)" })');
      expect(result.success).toBe(true);
      expect(result.call?.args.path).toBe('test.py');
      expect(result.call?.args.content).toBe('print(42)');
    });

    it('handles escaped newlines in content', () => {
      const result = parseToolCall('write_file("test.txt", "line1\\nline2\\nline3")');
      expect(result.success).toBe(true);
      expect(result.call?.args.content).toBe('line1\nline2\nline3');
    });

    it('handles escaped tabs in content', () => {
      const result = parseToolCall('write_file("test.txt", "col1\\tcol2")');
      expect(result.success).toBe(true);
      expect(result.call?.args.content).toBe('col1\tcol2');
    });

    it('handles backslashes in content', () => {
      const result = parseToolCall('write_file("test.txt", "path\\\\to\\\\file")');
      expect(result.success).toBe(true);
      expect(result.call?.args.content).toBe('path\\to\\file');
    });

    it('handles multiline Python code', () => {
      const content = 'def add(a, b):\\n    return a + b\\n';
      const result = parseToolCall(`write_file("test.py", "${content}")`);
      expect(result.success).toBe(true);
      expect(result.call?.args.content).toBe('def add(a, b):\n    return a + b\n');
    });

    it('handles content with commas', () => {
      const result = parseToolCall('write_file("test.csv", "a,b,c")');
      expect(result.success).toBe(true);
      expect(result.call?.args.content).toBe('a,b,c');
    });

    it('handles content with quotes (escaped)', () => {
      const result = parseToolCall('write_file("test.py", "print(\\"hello\\")")');
      expect(result.success).toBe(true);
      expect(result.call?.args.content).toBe('print("hello")');
    });

    it('fails without arguments', () => {
      const result = parseToolCall('write_file()');
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires');
    });

    it('fails with only one argument', () => {
      const result = parseToolCall('write_file("test.txt")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('two arguments');
    });

    it('fails with empty path', () => {
      const result = parseToolCall('write_file("", "content")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('non-empty');
    });
  });

  describe('JSON format', () => {
    it('parses JSON shell call', () => {
      const input = JSON.stringify({ name: 'shell', arguments: { command: 'ls' } });
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
      expect(result.call?.tool).toBe('shell');
      expect(result.call?.args.command).toBe('ls');
    });

    it('parses JSON read_file call', () => {
      const input = JSON.stringify({ name: 'read_file', arguments: { path: 'test.txt' } });
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
      expect(result.call?.tool).toBe('read_file');
    });

    it('parses JSON write_file call', () => {
      const input = JSON.stringify({
        name: 'write_file',
        arguments: { path: 'test.txt', content: 'hello' }
      });
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
      expect(result.call?.tool).toBe('write_file');
    });

    it('fails for unknown tool in JSON', () => {
      const input = JSON.stringify({ name: 'unknown_tool', arguments: {} });
      const result = parseToolCall(input);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('fails for malformed JSON', () => {
      const result = parseToolCall('{ broken json }');
      expect(result.success).toBe(false);
      expect(result.error).toContain('parse');
    });

    it('fails for JSON without name', () => {
      const result = parseToolCall('{ "arguments": {} }');
      expect(result.success).toBe(false);
      expect(result.error).toContain('name');
    });
  });

  describe('error handling', () => {
    it('rejects unknown tools', () => {
      const result = parseToolCall('unknown_tool("arg")');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
      expect(result.error).toContain('shell, read_file, write_file');
    });

    it('rejects invalid syntax', () => {
      const result = parseToolCall('not a valid call');
      expect(result.success).toBe(false);
    });

    it('detects unbalanced parentheses', () => {
      const result = parseToolCall('shell("test"');
      expect(result.success).toBe(false);
    });

    it('detects unbalanced braces', () => {
      const result = parseToolCall('shell({ command: "test" )');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unbalanced');
    });

    it('detects unclosed strings', () => {
      const result = parseToolCall('shell("unclosed)');
      expect(result.success).toBe(false);
    });
  });

  describe('whitespace handling', () => {
    it('handles leading/trailing whitespace', () => {
      const result = parseToolCall('   shell("ls")   ');
      expect(result.success).toBe(true);
    });

    it('handles whitespace around arguments', () => {
      const result = parseToolCall('write_file(  "path"  ,  "content"  )');
      expect(result.success).toBe(true);
    });

    it('handles multiline input', () => {
      const input = `write_file(
        "test.py",
        "def main():\\n    pass"
      )`;
      const result = parseToolCall(input);
      expect(result.success).toBe(true);
    });
  });
});

describe('processEscapeSequences', () => {
  it('converts \\n to newline', () => {
    expect(processEscapeSequences('a\\nb')).toBe('a\nb');
  });

  it('converts \\t to tab', () => {
    expect(processEscapeSequences('a\\tb')).toBe('a\tb');
  });

  it('converts \\r to carriage return', () => {
    expect(processEscapeSequences('a\\rb')).toBe('a\rb');
  });

  it('converts \\\\ to single backslash', () => {
    expect(processEscapeSequences('a\\\\b')).toBe('a\\b');
  });

  it('handles multiple escape sequences', () => {
    expect(processEscapeSequences('line1\\nline2\\n\\tindented')).toBe('line1\nline2\n\tindented');
  });

  it('preserves other characters', () => {
    expect(processEscapeSequences('hello world')).toBe('hello world');
  });
});
