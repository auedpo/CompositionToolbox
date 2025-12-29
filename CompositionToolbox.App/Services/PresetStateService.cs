using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text.Json;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public class PresetStateService
    {
        private const string StateFileName = "presets_state.json";
        private readonly string _statePath;
        private PresetState _state;

        public event EventHandler? StateChanged;

        public PresetStateService()
        {
            var folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "CompositionToolbox");
            Directory.CreateDirectory(folder);
            _statePath = Path.Combine(folder, StateFileName);
            _state = Load();
        }

        public IReadOnlyList<string> Favorites => _state.Favorites;
        public IReadOnlyList<string> Recents => _state.Recents;

        public bool IsFavorite(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return false;
            return _state.Favorites.Any(x => string.Equals(x, id, StringComparison.OrdinalIgnoreCase));
        }

        public void ToggleFavorite(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return;
            if (RemoveId(_state.Favorites, id))
            {
                Save();
                StateChanged?.Invoke(this, EventArgs.Empty);
                return;
            }

            _state.Favorites.Insert(0, id);
            Save();
            StateChanged?.Invoke(this, EventArgs.Empty);
        }

        public void AddRecent(string id)
        {
            if (string.IsNullOrWhiteSpace(id)) return;
            RemoveId(_state.Recents, id);
            _state.Recents.Insert(0, id);
            if (_state.Recents.Count > 10)
            {
                _state.Recents.RemoveRange(10, _state.Recents.Count - 10);
            }
            Save();
            StateChanged?.Invoke(this, EventArgs.Empty);
        }

        private PresetState Load()
        {
            try
            {
                if (File.Exists(_statePath))
                {
                    var json = File.ReadAllText(_statePath);
                    var state = JsonSerializer.Deserialize<PresetState>(json);
                    if (state != null)
                    {
                        state.Favorites ??= new List<string>();
                        state.Recents ??= new List<string>();
                        return state;
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine("Failed to load preset state: " + ex.Message);
            }

            return new PresetState();
        }

        private void Save()
        {
            try
            {
                var json = JsonSerializer.Serialize(_state, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(_statePath, json);
            }
            catch (Exception ex)
            {
                Debug.WriteLine("Failed to save preset state: " + ex.Message);
            }
        }

        private static bool RemoveId(List<string> list, string id)
        {
            for (int i = list.Count - 1; i >= 0; i--)
            {
                if (string.Equals(list[i], id, StringComparison.OrdinalIgnoreCase))
                {
                    list.RemoveAt(i);
                    return true;
                }
            }
            return false;
        }
    }
}
