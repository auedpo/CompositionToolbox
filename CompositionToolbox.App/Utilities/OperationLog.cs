// Purpose: Helper utilities for building and normalizing operation log payloads.

using System;
using System.Collections.Generic;
using System.Text.Json;

namespace CompositionToolbox.App.Utilities
{
    public static class OperationLog
    {
        public static Dictionary<string, object> CreateParams(Dictionary<string, object>? args = null, int version = 1)
        {
            var payload = args == null
                ? new Dictionary<string, object>()
                : new Dictionary<string, object>(args);

            return new Dictionary<string, object>
            {
                ["v"] = version,
                ["args"] = payload
            };
        }

        public static Dictionary<string, object> Normalize(Dictionary<string, object>? opParams)
        {
            if (opParams == null)
            {
                return CreateParams(null);
            }

            if (opParams.ContainsKey("args"))
            {
                var normalized = new Dictionary<string, object>(opParams);
                if (!normalized.ContainsKey("v"))
                {
                    normalized["v"] = 1;
                }
                return normalized;
            }

            var args = new Dictionary<string, object>();
            object? version = null;
            foreach (var kv in opParams)
            {
                if (kv.Key == "v")
                {
                    version = version ?? kv.Value;
                    continue;
                }
                if (IsTraceKey(kv.Key))
                {
                    continue;
                }
                args[kv.Key] = kv.Value;
            }

            var result = new Dictionary<string, object>
            {
                ["v"] = version ?? 1,
                ["args"] = args
            };

            foreach (var kv in opParams)
            {
                if (IsTraceKey(kv.Key))
                {
                    result[kv.Key] = kv.Value;
                }
            }

            return result;
        }

        public static IReadOnlyDictionary<string, object>? GetArgs(Dictionary<string, object>? opParams)
        {
            if (opParams == null)
            {
                return null;
            }

            if (opParams.TryGetValue("args", out var rawArgs))
            {
                if (rawArgs is Dictionary<string, object> dict)
                {
                    return dict;
                }
                if (rawArgs is JsonElement element && element.ValueKind == JsonValueKind.Object)
                {
                    var converted = new Dictionary<string, object>();
                    foreach (var prop in element.EnumerateObject())
                    {
                        converted[prop.Name] = prop.Value;
                    }
                    return converted;
                }
            }

            var filtered = new Dictionary<string, object>();
            foreach (var kv in opParams)
            {
                if (kv.Key == "v" || IsTraceKey(kv.Key))
                {
                    continue;
                }
                filtered[kv.Key] = kv.Value;
            }

            return filtered.Count == 0 ? null : filtered;
        }

        private static bool IsTraceKey(string key)
        {
            return key.StartsWith("__", StringComparison.Ordinal);
        }
    }
}
