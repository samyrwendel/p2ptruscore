# Telegram API Retry Configuration

## Overview

The TrustP2PBot now includes a robust retry mechanism for all Telegram API calls. This ensures reliability when facing temporary network issues, rate limiting, or other transient errors.

## How It Works

The `TelegramRetryService` automatically retries failed Telegram API calls using an **exponential backoff** strategy with jitter. It intelligently detects:

- **Rate limiting (429 errors)**: Respects the `Retry-After` header from Telegram
- **Network errors**: ECONNRESET, ETIMEDOUT, ENOTFOUND, ECONNREFUSED
- **Server errors**: 500, 502, 503, 504 HTTP errors
- **Temporary failures**: Socket hang ups, timeouts, temporary unavailability

## Environment Variables

Configure the retry behavior using these environment variables in your `.env` file:

```bash
# Maximum number of retry attempts (default: 5)
TELEGRAM_RETRY_MAX_ATTEMPTS=5

# Initial delay before first retry in milliseconds (default: 1000ms = 1 second)
TELEGRAM_RETRY_INITIAL_DELAY_MS=1000

# Maximum delay between retries in milliseconds (default: 30000ms = 30 seconds)
TELEGRAM_RETRY_MAX_DELAY_MS=30000

# Backoff multiplier factor (default: 2 = exponential backoff)
# Each retry delay = previous_delay * TELEGRAM_RETRY_BACKOFF_FACTOR
TELEGRAM_RETRY_BACKOFF_FACTOR=2
```

## Retry Strategy Examples

### Default Configuration (Exponential Backoff)
```
Attempt 1: 1000ms delay
Attempt 2: 2000ms delay
Attempt 3: 4000ms delay
Attempt 4: 8000ms delay
Attempt 5: 16000ms delay
```

### Conservative Configuration
For slower networks or high-latency scenarios:
```bash
TELEGRAM_RETRY_MAX_ATTEMPTS=7
TELEGRAM_RETRY_INITIAL_DELAY_MS=2000
TELEGRAM_RETRY_MAX_DELAY_MS=60000
TELEGRAM_RETRY_BACKOFF_FACTOR=2
```

### Aggressive Configuration
For fast networks with occasional hiccups:
```bash
TELEGRAM_RETRY_MAX_ATTEMPTS=3
TELEGRAM_RETRY_INITIAL_DELAY_MS=500
TELEGRAM_RETRY_MAX_DELAY_MS=10000
TELEGRAM_RETRY_BACKOFF_FACTOR=3
```

## Technical Details

### Retryable Errors

The service automatically retries these error codes:
- `429` - Too Many Requests (rate limiting)
- `500` - Internal Server Error
- `502` - Bad Gateway
- `503` - Service Unavailable
- `504` - Gateway Timeout

And these error messages:
- `ECONNRESET` - Connection reset by peer
- `ETIMEDOUT` - Operation timed out
- `ENOTFOUND` - DNS lookup failed
- `ECONNREFUSED` - Connection refused
- Network-related errors
- Socket hang up errors

### Non-Retryable Errors

Permanent errors that will fail immediately (no retry):
- `400` - Bad Request (invalid parameters)
- `401` - Unauthorized (invalid bot token)
- `403` - Forbidden (bot was blocked by user or lacks permissions)
- `404` - Not Found (chat/user doesn't exist)
- Application logic errors

### Jitter

A random jitter (up to 10% of the calculated delay) is added to prevent thundering herd problems when multiple requests fail simultaneously.

### Rate Limiting (429) Handling

When Telegram returns a 429 error with a `Retry-After` header, the service:
1. Respects the exact wait time specified by Telegram
2. Caps it at `TELEGRAM_RETRY_MAX_DELAY_MS` to prevent indefinite waits
3. Retries automatically after the specified delay

## Usage in Code

### Basic Usage

The retry service is automatically used in:
- `OperationsBroadcastService` - All broadcast messages
- `NewMemberHandler` - Welcome messages and terms acceptance
- All other services that inject `TelegramRetryService`

### Manual Usage

If you need to use the retry service in custom code:

```typescript
import { TelegramRetryService } from '../shared/telegram-retry.service';

@Injectable()
export class YourService {
  constructor(
    @InjectBot() private readonly bot: Telegraf,
    private readonly retryService: TelegramRetryService,
  ) {}

  async sendMessage(chatId: number, message: string) {
    // Automatic retry with default configuration
    return this.retryService.executeWithRetry(() =>
      this.bot.telegram.sendMessage(chatId, message)
    );
  }

  async sendWithCustomRetry(chatId: number, message: string) {
    // Custom retry configuration
    return this.retryService.executeWithRetry(
      () => this.bot.telegram.sendMessage(chatId, message),
      {
        maxRetries: 3,
        initialDelayMs: 500,
        maxDelayMs: 10000,
        backoffFactor: 2,
      }
    );
  }
}
```

### Batch Operations

For sending multiple messages with retry:

```typescript
async sendMultipleMessages(messages: Array<{ chatId: number; text: string }>) {
  const operations = messages.map(({ chatId, text }) =>
    () => this.bot.telegram.sendMessage(chatId, text)
  );

  const { successful, failed } = await this.retryService.executeMultipleWithRetry(
    operations
  );

  console.log(`Sent ${successful.length} messages, ${failed.length} failed`);
  return { successful, failed };
}
```

## Monitoring

The retry service logs detailed information:

```
WARN  Retryable error on attempt 1/5: ETIMEDOUT. Retrying in 1024ms...
WARN  Retryable error on attempt 2/5: 503 Service Unavailable. Retrying in 2156ms...
ERROR Max retries (5) exceeded. Last error: ECONNREFUSED
```

Monitor these logs to:
- Detect network issues
- Identify Telegram API problems
- Tune retry configuration

## Migration Notes

### Legacy Code

The old `sendWithBackoff` method in `OperationsBroadcastService` has been updated to use `TelegramRetryService` internally. No code changes needed for existing services.

### Breaking Changes

None. The retry service is backward-compatible with existing code.

## Best Practices

1. **Don't override defaults unnecessarily**: The default configuration works well for most scenarios
2. **Monitor retry logs**: Watch for patterns that indicate underlying issues
3. **Set reasonable max delays**: Avoid blocking operations for too long (default 30s is reasonable)
4. **Consider user experience**: For user-facing operations, shorter retries may be better
5. **Use batch operations**: When sending many messages, use `executeMultipleWithRetry` for better error handling

## Troubleshooting

### Too Many Retries
If you see constant retries, check:
- Network connectivity
- Telegram API status (https://status.telegram.org)
- Bot token validity
- Rate limiting (consider increasing delays)

### Not Enough Retries
If operations fail too quickly:
- Increase `TELEGRAM_RETRY_MAX_ATTEMPTS`
- Increase `TELEGRAM_RETRY_INITIAL_DELAY_MS`
- Check for non-retryable errors in logs

### Slow Performance
If retries are causing slowness:
- Decrease `TELEGRAM_RETRY_MAX_ATTEMPTS`
- Decrease `TELEGRAM_RETRY_MAX_DELAY_MS`
- Fix underlying network/API issues
