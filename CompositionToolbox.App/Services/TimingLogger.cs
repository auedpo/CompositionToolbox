using System;
using System.IO;
using System.Diagnostics;

namespace CompositionToolbox.App.Services
{
    internal static class TimingLogger
    {
        private static readonly string LogPath = Path.Combine(AppContext.BaseDirectory, "timings.log");

        private static string? _lastMessage;
        private static DateTime _lastMessageTime = DateTime.MinValue;
        private static readonly object _lock = new object();
        private static readonly TimeSpan _dedupeWindow = TimeSpan.FromSeconds(10);

        public static void Log(string message)
        {
            // Avoid flooding the log with repeated identical messages within a short window
            lock (_lock)
            {
                var now = DateTime.UtcNow;
                if (string.Equals(message, _lastMessage, StringComparison.Ordinal) && (now - _lastMessageTime) < _dedupeWindow)
                {
                    return; // skip duplicate
                }
                _lastMessage = message;
                _lastMessageTime = now;
            }

            var line = $"{DateTime.UtcNow:O} {message}{Environment.NewLine}";
            try
            {
                File.AppendAllText(LogPath, line);
            }
            catch
            {
                // ignore logging failures
            }
            Debug.WriteLine(message);
        }
    }
}
