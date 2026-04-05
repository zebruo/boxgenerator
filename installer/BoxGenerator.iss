#define AppName "BoxGenerator"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif
#define AppPublisher "BoxGenerator"
#define AppExeName "BoxGenerator.exe"
#define AppId "{{B2C3D4E5-F6A7-8901-BCDE-F12345678901}"

[Setup]
AppId={#AppId}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppPublisher}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=BoxGenerator-Setup-{#AppVersion}
UninstallDisplayIcon={app}\{#AppExeName}
UninstallDisplayName={#AppName}
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
VersionInfoVersion={#AppVersion}

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "Créer un raccourci sur le Bureau"; GroupDescription: "Raccourcis supplémentaires :"; Flags: unchecked

[Files]
Source: "..\dist\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExeName}"
Name: "{group}\Désinstaller {#AppName}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\{#AppName}"; Filename: "{app}\{#AppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExeName}"; Description: "Lancer {#AppName}"; Flags: nowait postinstall skipifsilent

[Code]
// Détecte et désinstalle silencieusement toute version précédente
procedure UninstallPreviousVersion();
var
  UninstallString: String;
  ResultCode: Integer;
begin
  // Cherche la clé de désinstallation dans le registre (64 bits)
  if not RegQueryStringValue(HKLM,
    'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1',
    'UninstallString', UninstallString) then
  begin
    // Fallback : registre 32 bits (WOW6432Node)
    RegQueryStringValue(HKLM,
      'SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\{#AppId}_is1',
      'UninstallString', UninstallString);
  end;

  if UninstallString <> '' then
  begin
    UninstallString := RemoveQuotes(UninstallString);
    // /SILENT : désinstallation sans fenêtre ni confirmation
    // /NORESTART : pas de redémarrage automatique
    Exec(UninstallString, '/SILENT /NORESTART', '', SW_HIDE,
      ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    UninstallPreviousVersion();
end;
