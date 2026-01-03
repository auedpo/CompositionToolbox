using System;
using System.Text;
using System.IO;
using System.Diagnostics;
using System.Linq;
using System.Windows;
using System.Windows.Media;
using CompositionToolbox.App.Views.Behaviors;

namespace CompositionToolbox.App
{
    public partial class App : System.Windows.Application
    {
        public Services.SettingsService? SettingsService { get; private set; }
        public Models.AppSettings? AppSettings { get; private set; }

        public void InitializeServices(Services.SettingsService settingsService, Models.AppSettings appSettings)
        {
            SettingsService = settingsService;
            AppSettings = appSettings;
        }

        private void Application_Startup(object sender, StartupEventArgs e)
        {
            SliderWheelBehavior.EnsureInitialized();
            TextBoxClearButtonBehavior.EnsureInitialized();
            var windowBrush = TryFindResource(System.Windows.SystemColors.WindowBrushKey) as System.Windows.Media.Brush
                ?? (System.Windows.Media.Brush)FindResource(System.Windows.SystemColors.WindowBrushKey);

            Current.Resources["App.DividerBrush"] = CreateLightenedBrush(windowBrush, 0.05);

            // Gripper dot brush: 80% translucent white (alpha ~ 204) so dots are subtly visible on darker backgrounds
            var gripperColor = System.Windows.Media.Color.FromArgb(204, 255, 255, 255);
            var gripperBrush = new System.Windows.Media.SolidColorBrush(gripperColor);
            gripperBrush.Freeze();
            Current.Resources["App.GripperDotBrush"] = gripperBrush;

#if DEBUG
            try
            {
                var logSb = new StringBuilder();
                logSb.AppendLine($"--- CompositionToolbox Resource Keys ({DateTime.UtcNow:u}) ---");
                logSb.AppendLine($"BuildConfig: {(Debugger.IsAttached ? "Debug (attached)" : "Debug")}");

                logSb.AppendLine("Application.Current.Resources.Keys:");
                foreach (var key in Current.Resources.Keys.Cast<object?>().Select(k => k?.ToString() ?? string.Empty).OrderBy(k => k))
                {
                    logSb.AppendLine($"  {key}");
                }

                logSb.AppendLine("Theme diagnostics:");
                logSb.AppendLine($"  HighContrast: {SystemParameters.HighContrast}");
                logSb.AppendLine($"  WindowGlassColor: {SystemParameters.WindowGlassColor}");
                var winBrush = TryFindResource(System.Windows.SystemColors.WindowBrushKey);
                logSb.AppendLine($"  SystemColors.WindowBrushKey: {(winBrush == null ? "<missing>" : winBrush.GetType().FullName)}");
                if (winBrush is System.Windows.Media.SolidColorBrush windowSb)
                {
                    logSb.AppendLine($"  WindowBrush Color: #{windowSb.Color.A:X2}{windowSb.Color.R:X2}{windowSb.Color.G:X2}{windowSb.Color.B:X2}");
                }
                var accentBrush = TryFindResource(System.Windows.SystemColors.AccentColorBrushKey);
                logSb.AppendLine($"  SystemColors.AccentColorBrushKey: {(accentBrush == null ? "<missing>" : accentBrush.GetType().FullName)}");
                if (accentBrush is System.Windows.Media.SolidColorBrush accentSb)
                {
                    logSb.AppendLine($"  AccentBrush Color: #{accentSb.Color.A:X2}{accentSb.Color.R:X2}{accentSb.Color.G:X2}{accentSb.Color.B:X2}");
                }

                logSb.AppendLine("Merged dictionaries:");
                foreach (var md in Current.Resources.MergedDictionaries)
                {
                    logSb.AppendLine($"  - {md.Source}");
                }

                logSb.AppendLine("Merged dictionary keys:");
                foreach (var md in Current.Resources.MergedDictionaries)
                {
                    try
                    {
                        var keys = md.Keys.Cast<object?>()
                            .Select(k => k?.ToString() ?? string.Empty)
                            .OrderBy(k => k)
                            .ToArray();

                        logSb.AppendLine($"  {md.Source} -> {keys.Length} keys:");
                        foreach (var k in keys) logSb.AppendLine($"    {k}");

                        var themeDictProp = md.GetType().GetProperty("ThemeDictionaries");
                        if (themeDictProp?.GetValue(md) is System.Collections.IDictionary themeDicts && themeDicts.Count > 0)
                        {
                            logSb.AppendLine($"  {md.Source} ThemeDictionaries:");
                            foreach (var themeKey in themeDicts.Keys)
                            {
                                var themeName = themeKey?.ToString() ?? "<null>";
                                if (themeKey == null)
                                {
                                    logSb.AppendLine("    <null> -> <non-dictionary>");
                                    continue;
                                }
                                if (themeDicts[themeKey] is ResourceDictionary td)
                                {
                                    var tkeys = td.Keys.Cast<object?>()
                                        .Select(k => k?.ToString() ?? string.Empty)
                                        .OrderBy(k => k)
                                        .ToArray();
                                    logSb.AppendLine($"    {themeName} -> {tkeys.Length} keys:");
                                    foreach (var tk in tkeys) logSb.AppendLine($"      {tk}");
                                }
                                else
                                {
                                    logSb.AppendLine($"    {themeName} -> <non-dictionary>");
                                }
                            }
                        }
                    }
                    catch (Exception ex)
                    {
                        logSb.AppendLine($"  Failed to enumerate keys for {md.Source}: {ex.Message}");
                    }
                }

                var msg = logSb.ToString();
                Debug.WriteLine(msg);

                try
                {
                    var path = Path.Combine(Path.GetTempPath(), "CompositionToolbox.ResourceKeys.debug.log");
                    File.AppendAllText(path, msg + Environment.NewLine);
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Failed to write resource key file: {ex.Message}");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"Resource key enumeration failed: {ex.Message}");
            }

            // Attach a file-based Trace listener for easier capture of Trace.WriteLine output during debugging.
            try
            {
                try
                {
                    var traceFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CompositionToolbox");
                    Directory.CreateDirectory(traceFolder);
                    var tracePath = Path.Combine(traceFolder, "trace.log");

                    Trace.Listeners.Add(new TextWriterTraceListener(tracePath));
                    Trace.AutoFlush = true;
                    Trace.WriteLine($"--- CompositionToolbox Trace started: {DateTime.UtcNow:o} ---");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"Failed to create trace file listener: {ex.Message}");
                }
            }
            catch { }
#endif
        }

        private static System.Windows.Media.Brush CreateLightenedBrush(System.Windows.Media.Brush baseBrush, double amount)
        {
            if (baseBrush is not System.Windows.Media.SolidColorBrush sb)
            {
                return baseBrush;
            }

            var c = sb.Color;
            byte Lighten(byte channel) => (byte)Math.Min(255, channel + (255 - channel) * amount);
            return new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromArgb(
                c.A,
                Lighten(c.R),
                Lighten(c.G),
                Lighten(c.B)));
        }

        private static System.Windows.Media.Brush CreateDarkenedBrush(System.Windows.Media.Brush baseBrush, double amount)
        {
            if (baseBrush is not System.Windows.Media.SolidColorBrush sb)
            {
                return baseBrush;
            }

            var c = sb.Color;
            byte Darken(byte channel) => (byte)Math.Max(0, channel - (int)(channel * amount));
            return new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromArgb(
                c.A,
                Darken(c.R),
                Darken(c.G),
                Darken(c.B)));
        }
    }
}
