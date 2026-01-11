// Purpose: Service orchestrating project operations for the app.

using System;
using System.IO;
using System.Text.Json;
using CompositionToolbox.App.Models;

namespace CompositionToolbox.App.Services
{
    public class ProjectService
    {
        private const string ProjectFileName = "composition-toolbox.project.json";
        public string ProjectFolder { get; }
        public string ProjectFilePath => Path.Combine(ProjectFolder, ProjectFileName);

        public ProjectService(string projectFolder)
        {
            ProjectFolder = projectFolder;
        }

        public ProjectData LoadOrCreate()
        {
            Directory.CreateDirectory(ProjectFolder);
            if (!File.Exists(ProjectFilePath))
            {
                var data = CreateNewProject();
                Save(data);
                return data;
            }

            var json = File.ReadAllText(ProjectFilePath);
            return JsonSerializer.Deserialize<ProjectData>(json, new JsonSerializerOptions
            {
                PropertyNameCaseInsensitive = true
            }) ?? CreateNewProject();
        }

        public void Save(ProjectData data)
        {
            Directory.CreateDirectory(ProjectFolder);
            var json = JsonSerializer.Serialize(data, new JsonSerializerOptions
            {
                WriteIndented = true
            });
            File.WriteAllText(ProjectFilePath, json);
        }

        public static ProjectData CreateNewProject()
        {
            var composite = new Composite
            {
                Title = "Default"
            };
            var state = new CompositeState
            {
                CompositeId = composite.CompositeId
            };
            composite.CurrentStateId = state.StateId;

            return new ProjectData
            {
                Composites = { composite },
                States = { state },
                ActiveCompositeId = composite.CompositeId,
                ActiveStateId = state.StateId
            };
        }
    }
}
