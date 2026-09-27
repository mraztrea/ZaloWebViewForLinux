import { CommandLineArgs, PROFILE_ID_REGEX, MAX_PROFILE_ID_LENGTH } from '../shared/types';

/** Switch Chromium dạng --key=value; trừ tùy chọn của chính zaloview. */
const CHROMIUM_SWITCH_REGEX = /^--(?!(?:profile|manager|help|version)=)[a-z0-9][a-z0-9-]*=/;

export class CommandLineError extends Error {
  public readonly exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CommandLineError';
    this.exitCode = exitCode;
  }
}

export function validateProfileId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  if (id.length === 0 || id.length > MAX_PROFILE_ID_LENGTH) return false;
  return PROFILE_ID_REGEX.test(id);
}

export function getHelpText(): string {
  return `
Sử dụng: zaloview [tùy chọn]

Tùy chọn:
  --manager, -m          Mở bảng điều khiển quản lý (Dashboard). Mặc định nếu không có cờ.
  --profile, -p <id>     Mở hoặc khôi phục cửa sổ runner của profile <id>.
  --help, -h             Hiển thị hướng dẫn sử dụng này.
  --version, -v          Hiển thị phiên bản ứng dụng.

Ví dụ:
  zaloview --manager
  zaloview --profile zalo
  zaloview -p work-chat
`.trim();
}

export function parseCommandLineArgs(argv: string[], isPackaged = false): CommandLineArgs {
  let mode: 'manager' | 'profile' | null = null;
  let profileId: string | null = null;
  let helpRequested = false;
  let versionRequested = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      helpRequested = true;
    } else if (arg === '--version' || arg === '-v') {
      versionRequested = true;
    } else if (arg === '--manager' || arg === '-m') {
      if (mode === 'profile') {
        throw new CommandLineError('Không thể sử dụng đồng thời cả --manager và --profile', 2);
      }
      mode = 'manager';
    } else if (arg === '--profile' || arg === '-p') {
      if (mode === 'manager') {
        throw new CommandLineError('Không thể sử dụng đồng thời cả --manager và --profile', 2);
      }
      const nextArg = argv[i + 1];
      if (!nextArg || nextArg.startsWith('-')) {
        throw new CommandLineError('Tùy chọn --profile yêu cầu cung cấp mã định danh profile hợp lệ', 1);
      }
      if (!validateProfileId(nextArg)) {
        throw new CommandLineError(
          `Mã định danh profile không hợp lệ: "${nextArg}". Chỉ chấp nhận chữ thường, số và dấu gạch ngang (tối đa 64 ký tự).`,
          1
        );
      }
      mode = 'profile';
      profileId = nextArg;
      i++; // Skip the next argument as it is the profile id
    } else if (CHROMIUM_SWITCH_REGEX.test(arg)) {
      // Switch Chromium/Electron (vd: --ozone-platform=wayland) do Chromium tự xử lý.
      continue;
    } else {
      throw new CommandLineError(`Tùy chọn không xác định: "${arg}". Dùng --help để xem danh sách tùy chọn.`, 1);
    }
  }

  return {
    mode: mode ?? 'manager',
    profileId,
    rawArgs: argv,
    isPackaged,
    helpRequested,
    versionRequested
  };
}
