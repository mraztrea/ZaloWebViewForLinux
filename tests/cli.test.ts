import { describe, it, expect } from 'vitest';
import { parseCommandLineArgs, CommandLineError } from '../src/main/cli';

describe('User Story 2: Command Line Parser', () => {
  it('should default to manager mode when no arguments provided', () => {
    const result = parseCommandLineArgs([]);
    expect(result.mode).toBe('manager');
    expect(result.profileId).toBeNull();
  });

  it('should parse --manager or -m flag', () => {
    const res1 = parseCommandLineArgs(['--manager']);
    expect(res1.mode).toBe('manager');
    expect(res1.profileId).toBeNull();

    const res2 = parseCommandLineArgs(['-m']);
    expect(res2.mode).toBe('manager');
    expect(res2.profileId).toBeNull();
  });

  it('should parse --profile <id> or -p <id> with valid slug', () => {
    const res1 = parseCommandLineArgs(['--profile', 'zalo']);
    expect(res1.mode).toBe('profile');
    expect(res1.profileId).toBe('zalo');

    const res2 = parseCommandLineArgs(['-p', 'work-chat-1']);
    expect(res2.mode).toBe('profile');
    expect(res2.profileId).toBe('work-chat-1');
  });

  it('should reject --profile without an argument', () => {
    expect(() => parseCommandLineArgs(['--profile'])).toThrow(CommandLineError);
  });

  it('should reject invalid profile IDs (path traversal, uppercase, symbols)', () => {
    expect(() => parseCommandLineArgs(['--profile', '../escape'])).toThrow(CommandLineError);
    expect(() => parseCommandLineArgs(['--profile', 'ZaloUpper'])).toThrow(CommandLineError);
    expect(() => parseCommandLineArgs(['--profile', 'has space'])).toThrow(CommandLineError);
    expect(() => parseCommandLineArgs(['--profile', 'has_underscore'])).toThrow(CommandLineError);
    expect(() => parseCommandLineArgs(['--profile', 'a'.repeat(65)])).toThrow(CommandLineError);
  });

  it('should reject conflicting --manager and --profile flags', () => {
    expect(() => parseCommandLineArgs(['--manager', '--profile', 'zalo'])).toThrow(CommandLineError);
    expect(() => parseCommandLineArgs(['-p', 'zalo', '-m'])).toThrow(CommandLineError);
  });

  it('should reject unknown flags', () => {
    expect(() => parseCommandLineArgs(['--unknown-flag'])).toThrow(CommandLineError);
    // Tùy chọn của app dạng --x=y không được lẫn thành switch Chromium.
    expect(() => parseCommandLineArgs(['--profile=zalo'])).toThrow(CommandLineError);
  });

  it('bỏ qua switch Chromium dạng --key=value', () => {
    const args = parseCommandLineArgs(['--ozone-platform=wayland', '-p', 'zalo']);
    expect(args.mode).toBe('profile');
    expect(args.profileId).toBe('zalo');
  });

  it('should handle --help and -h', () => {
    const res1 = parseCommandLineArgs(['--help']);
    expect(res1.helpRequested).toBe(true);

    const res2 = parseCommandLineArgs(['-h']);
    expect(res2.helpRequested).toBe(true);
  });

  it('should handle --version and -v', () => {
    const res1 = parseCommandLineArgs(['--version']);
    expect(res1.versionRequested).toBe(true);

    const res2 = parseCommandLineArgs(['-v']);
    expect(res2.versionRequested).toBe(true);
  });
});
