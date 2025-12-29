using System;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public class SettingsService
    {
        private const string SettingsFileName = "settings.json";
        private readonly string _settingsPath;

        public SettingsService()
        {
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CompositionToolbox");
            Directory.CreateDirectory(folder);
            _settingsPath = Path.Combine(folder, SettingsFileName);
        }

        public AppSettings Load()
        {
            try
            {
                if (File.Exists(_settingsPath))
                {
                    var json = File.ReadAllText(_settingsPath);
                    var settings = JsonSerializer.Deserialize<AppSettings>(json);
                    if (settings != null)
                    {
                        return settings;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("Failed to load settings: " + ex.Message);
            }

            return new AppSettings();
        }

        public void Save(AppSettings settings)
        {
            try
            {
                var json = JsonSerializer.Serialize(settings, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_settingsPath, json);
            }
            catch (Exception ex)
            {
                Debug.WriteLine("Failed to save settings: " + ex.Message);
            }
        }
    }
}
