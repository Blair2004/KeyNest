using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace KeynestAuthenticator;

public sealed class MainForm : Form
{
    private readonly WebView2 _webView = new()
    {
        Dock = DockStyle.Fill,
        DefaultBackgroundColor = Color.FromArgb(246, 247, 249)
    };

    public MainForm()
    {
        Text = "Keynest Authenticator";
        StartPosition = FormStartPosition.CenterScreen;
        MinimumSize = new Size(820, 620);
        ClientSize = new Size(1280, 800);
        BackColor = Color.FromArgb(246, 247, 249);
        AutoScaleMode = AutoScaleMode.Dpi;

        Controls.Add(_webView);
        Shown += OnShown;
    }

    private async void OnShown(object? sender, EventArgs e)
    {
        Shown -= OnShown;

        try
        {
            var dataDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "KeynestAuthenticator",
                "WebView2");

            var environment = await CoreWebView2Environment.CreateAsync(
                userDataFolder: dataDirectory);

            await _webView.EnsureCoreWebView2Async(environment);

            var webRoot = Path.Combine(AppContext.BaseDirectory, "Web");
            if (!File.Exists(Path.Combine(webRoot, "index.html")))
            {
                throw new FileNotFoundException(
                    "The application interface could not be found.",
                    Path.Combine(webRoot, "index.html"));
            }

            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "app.keynest.local",
                webRoot,
                CoreWebView2HostResourceAccessKind.DenyCors);

            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = false;
            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.IsZoomControlEnabled = true;
            _webView.CoreWebView2.Navigate("https://app.keynest.local/index.html");
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show(
                this,
                "Keynest needs the Microsoft Edge WebView2 Runtime. It is normally included with Windows 10 and 11. Install WebView2, then open Keynest again.",
                "WebView2 is required",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
        catch (Exception exception)
        {
            MessageBox.Show(
                this,
                $"Keynest could not start.\n\n{exception.Message}",
                "Startup error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Close();
        }
    }
}
