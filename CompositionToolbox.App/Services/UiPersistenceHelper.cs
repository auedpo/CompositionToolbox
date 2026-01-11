// Purpose: Service that persists UI layout state and window placements.

using System;
using System.Windows;
using System.Windows.Controls;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public static class UiPersistenceHelper
    {
        public static bool ApplyWindowPlacement(Window window, AppSettings settings, string key, bool applySize = true)
        {
            if (settings.WindowPlacements.TryGetValue(key, out var placement))
            {
                window.WindowStartupLocation = WindowStartupLocation.Manual;
                window.Left = placement.Left;
                window.Top = placement.Top;
                if (applySize && placement.Width > 0 && placement.Height > 0)
                {
                    window.Width = placement.Width;
                    window.Height = placement.Height;
                }
                if (Enum.TryParse(placement.WindowState, true, out WindowState state))
                {
                    window.WindowState = state;
                }
                return true;
            }
            return false;
        }

        public static void SaveWindowPlacement(Window window, AppSettings settings, string key)
        {
            var bounds = window.WindowState == WindowState.Normal
                ? new Rect(window.Left, window.Top, window.Width, window.Height)
                : window.RestoreBounds;
            settings.WindowPlacements[key] = new WindowPlacementSettings
            {
                Width = bounds.Width,
                Height = bounds.Height,
                Left = bounds.Left,
                Top = bounds.Top,
                WindowState = window.WindowState.ToString()
            };
        }

        public static void ApplyColumnWidth(ColumnDefinition column, AppSettings settings, string key, double? fallback = null)
        {
            if (settings.PanelWidths.TryGetValue(key, out var width) && width > 0)
            {
                column.Width = new GridLength(width);
                return;
            }
            if (fallback.HasValue && fallback.Value > 0)
            {
                column.Width = new GridLength(fallback.Value);
            }
        }

        public static void SaveColumnWidth(ColumnDefinition column, AppSettings settings, string key)
        {
            settings.PanelWidths[key] = column.ActualWidth;
        }
    }
}
