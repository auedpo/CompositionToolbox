using System.Windows;

namespace CompositionToolbox.App
{
    public partial class App : Application
    {
        public Services.SettingsService? SettingsService { get; private set; }
        public Models.AppSettings? AppSettings { get; private set; }

        public void InitializeServices(Services.SettingsService settingsService, Models.AppSettings appSettings)
        {
            SettingsService = settingsService;
            AppSettings = appSettings;
        }
    }
}
