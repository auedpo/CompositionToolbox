// Purpose: Service that manages palette swapping and exposes semantic brushes.

using System;
using System.Windows;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public static class AppTheme
    {
        public static void Apply(AppThemeKind kind)
        {
            var app = System.Windows.Application.Current;
            if (app == null)
            {
                return;
            }

            var dicts = app.Resources.MergedDictionaries;
            for (var i = dicts.Count - 1; i >= 0; i--)
            {
                var source = dicts[i].Source?.OriginalString ?? string.Empty;
                if (source.Contains("AppTheme.Palette.", StringComparison.OrdinalIgnoreCase))
                {
                    dicts.RemoveAt(i);
                }
            }

            var uri = kind == AppThemeKind.LightNeutral
                ? "Themes/AppTheme.Palette.LightNeutral.xaml"
                : "Themes/AppTheme.Palette.DarkNeutral.xaml";
            dicts.Add(new ResourceDictionary { Source = new Uri(uri, UriKind.Relative) });
        }
    }
}
