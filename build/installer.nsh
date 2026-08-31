; CommandDeck — custom installer options
; Desktop shortcut: default ON (user can uncheck)
; Pin to taskbar: default OFF (user can check)
;
; electron-builder itself has NO UI checkbox for desktop shortcuts;
; createDesktopShortcut must be false so we control it here.

!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var CD_DesktopCheck
Var CD_TaskbarCheck
Var CD_WantDesktop
Var CD_WantTaskbar

!macro customInit
  ; Defaults before the page (and if the page is skipped)
  StrCpy $CD_WantDesktop "1"
  StrCpy $CD_WantTaskbar "0"
!macroend

!ifndef BUILD_UNINSTALLER

!macro customPageAfterChangeDir
  Page custom CD_ShortcutsPageCreate CD_ShortcutsPageLeave
!macroend

Function CD_ShortcutsPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0u 100% 28u "Standaard zetten we een icoon op het bureaublad. Vastmaken aan de taakbalk is optioneel."
  Pop $1

  ${NSD_CreateCheckbox} 0 40u 100% 14u "Snelkoppeling op het bureaublad"
  Pop $CD_DesktopCheck
  ${If} $CD_WantDesktop == "1"
    ${NSD_Check} $CD_DesktopCheck
  ${EndIf}

  ${NSD_CreateCheckbox} 0 60u 100% 14u "Vastmaken aan de taakbalk"
  Pop $CD_TaskbarCheck
  ${If} $CD_WantTaskbar == "1"
    ${NSD_Check} $CD_TaskbarCheck
  ${EndIf}

  ${NSD_CreateLabel} 0 90u 100% 40u "Tip: op Windows 10/11 blokkeert Microsoft soms automatisch vastmaken. Dan kun je CommandDeck handmatig vastmaken via Start → rechtsklik → Meer → Vastmaken aan taakbalk."
  Pop $1

  nsDialogs::Show
FunctionEnd

Function CD_ShortcutsPageLeave
  ${NSD_GetState} $CD_DesktopCheck $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $CD_WantDesktop "1"
  ${Else}
    StrCpy $CD_WantDesktop "0"
  ${EndIf}

  ${NSD_GetState} $CD_TaskbarCheck $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $CD_WantTaskbar "1"
  ${Else}
    StrCpy $CD_WantTaskbar "0"
  ${EndIf}
FunctionEnd

!macro customInstall
  ; Desktop shortcut (only if user left the box checked)
  ${If} $CD_WantDesktop == "1"
    CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
    ClearErrors
    WinShell::SetLnkAUMI "$DESKTOP\${SHORTCUT_NAME}.lnk" "${APP_ID}"
    System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
  ${EndIf}

  ; Taskbar pin (only if user checked it — often blocked on Win10/11)
  ; StdUtils expects: out, folder, filename, verb
  ${If} $CD_WantTaskbar == "1"
    ${StdUtils.InvokeShellVerb} $0 "$INSTDIR" "${APP_EXECUTABLE_FILENAME}" ${StdUtils.Const.ShellVerb.PinToTaskbar}
    ${If} ${FileExists} "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
      ${StdUtils.InvokeShellVerb} $0 "$SMPROGRAMS" "${SHORTCUT_NAME}.lnk" ${StdUtils.Const.ShellVerb.PinToTaskbar}
    ${EndIf}
  ${EndIf}
!macroend

!endif

!macro customUnInstall
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$DESKTOP\Flutter Launcher.lnk"
  Delete "$SMPROGRAMS\Flutter Launcher.lnk"
  ${StdUtils.InvokeShellVerb} $0 "$INSTDIR" "${APP_EXECUTABLE_FILENAME}" ${StdUtils.Const.ShellVerb.UnpinFromTaskbar}
!macroend
