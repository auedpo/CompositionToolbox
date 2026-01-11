// Purpose: Service orchestrating drag out file operations for the app.

using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;

namespace CompositionToolbox.App.Services
{
    public sealed class DragOutFileService
    {
        private readonly string _root;
        private readonly string _queuePath;
        private readonly object _queueLock = new object();

        public DragOutFileService()
        {
            _root = Path.Combine(Path.GetTempPath(), "CompositionToolbox", "DragOut");
            _queuePath = Path.Combine(_root, "delete-queue.txt");
        }

        public string CreateTempPath(string displayName, Guid compositeId)
        {
            Directory.CreateDirectory(_root);
            var safeName = SanitizeFileName(displayName);
            if (string.IsNullOrWhiteSpace(safeName))
            {
                safeName = "Composite";
            }
            var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var idShort = compositeId.ToString("N")[..6];
            var fileName = $"CTB_{safeName}_{timestamp}_{idShort}.mid";
            return Path.Combine(_root, fileName);
        }

        public void TryDeleteOrQueue(string path)
        {
            if (string.IsNullOrWhiteSpace(path)) return;
            try
            {
                if (File.Exists(path))
                {
                    File.Delete(path);
                }
            }
            catch (IOException)
            {
                QueueDelete(path);
            }
            catch (UnauthorizedAccessException)
            {
                QueueDelete(path);
            }
        }

        public void CleanupOldFilesAndQueuedDeletes()
        {
            Directory.CreateDirectory(_root);
            RetryQueuedDeletes();
            DeleteOldFiles(TimeSpan.FromDays(7));
        }

        private void RetryQueuedDeletes()
        {
            if (!File.Exists(_queuePath)) return;
            string[] lines;
            lock (_queueLock)
            {
                lines = File.ReadAllLines(_queuePath);
            }
            if (lines.Length == 0) return;

            var remaining = new List<string>();
            foreach (var line in lines.Select(l => l.Trim()).Where(l => !string.IsNullOrWhiteSpace(l)))
            {
                try
                {
                    if (File.Exists(line))
                    {
                        File.Delete(line);
                    }
                }
                catch (IOException)
                {
                    remaining.Add(line);
                }
                catch (UnauthorizedAccessException)
                {
                    remaining.Add(line);
                }
            }

            lock (_queueLock)
            {
                if (remaining.Count == 0)
                {
                    File.Delete(_queuePath);
                }
                else
                {
                    File.WriteAllLines(_queuePath, remaining);
                }
            }
        }

        private void QueueDelete(string path)
        {
            Directory.CreateDirectory(_root);
            lock (_queueLock)
            {
                File.AppendAllLines(_queuePath, new[] { path });
            }
        }

        private void DeleteOldFiles(TimeSpan maxAge)
        {
            var cutoff = DateTime.UtcNow - maxAge;
            foreach (var file in Directory.EnumerateFiles(_root, "CTB_*.mid", SearchOption.TopDirectoryOnly))
            {
                try
                {
                    var lastWrite = File.GetLastWriteTimeUtc(file);
                    if (lastWrite <= cutoff)
                    {
                        File.Delete(file);
                    }
                }
                catch (IOException)
                {
                    QueueDelete(file);
                }
                catch (UnauthorizedAccessException)
                {
                    QueueDelete(file);
                }
            }
        }

        private static string SanitizeFileName(string input)
        {
            if (string.IsNullOrWhiteSpace(input)) return string.Empty;
            var invalid = Path.GetInvalidFileNameChars();
            var chars = input.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray();
            return new string(chars).Trim();
        }
    }
}
