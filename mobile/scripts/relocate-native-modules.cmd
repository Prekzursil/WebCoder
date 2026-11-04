@echo off
rem [build-env] Windows deep-worktree helper for the Android release build.
rem ninja hard-caps paths at 260 chars; the mandated disposable-worktree
rem location is already ~200 chars deep, so the CMake builds of the five
rem cmake-heavy native modules (and their codegen object paths) overflow.
rem This script PHYSICALLY RELOCATES those packages to C:\rnreal\node_modules,
rem junctions them back into node_modules (node resolution unchanged), and
rem mirrors every other top-level node_modules entry as a junction so the
rem relocated packages keep their hoisted siblings. Pairs with the
rem projectDir override table in android/settings.gradle (which no-ops
rem when C:\rnreal is absent). Usage: relocate-native-modules.cmd
setlocal enableextensions
set DEEP=%~dp0..\node_modules
set SHORT=C:\rnreal\node_modules
if not exist "%SHORT%" mkdir "%SHORT%"
for %%P in (react-native-screens react-native-worklets expo-modules-core react-native-reanimated react-native-gesture-handler) do (
  if exist "%DEEP%\%%P\" (
    if not exist "%SHORT%\%%P" move "%DEEP%\%%P" "%SHORT%\%%P" >nul
  )
  if exist "%DEEP%\%%P" rmdir "%DEEP%\%%P"
  if not exist "%DEEP%\%%P" mklink /J "%DEEP%\%%P" "%SHORT%\%%P" >nul
)
rem Twin-farm: every other top-level entry becomes a junction inside the
rem short tree so require() from the relocated packages finds hoisted deps.
for /d %%D in ("%DEEP%\*") do if not exist "%SHORT%\%%~nxD" mklink /J "%SHORT%\%%~nxD" "%%D" >nul
for  %%F in ("%DEEP%\*") do if not exist "%SHORT%\%%~nxF" mklink /H "%SHORT%\%%~nxF" "%%F" >nul 2>&1
echo Relocated native modules to %SHORT%
