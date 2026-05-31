#pragma once
#include <string>
#include <functional>

// 게임 프로세스 감지(방법 B) + 킬 스위치.
namespace watcher {

// 게임 표시명 → 실행 파일명 매핑은 Watcher.cpp 의 표에서 관리.
// (예: "배틀그라운드" → "TslGame.exe")

// 현재 실행 중인, 우리가 아는 게임의 표시명을 반환(없으면 빈 문자열).
std::string detectRunningGame();

// 특정 게임의 프로세스를 강제 종료(킬 스위치).
void killGame(const std::string& displayName);

// 백그라운드 감지 스레드 시작/중지. 콜백으로 감지된 게임명을 전달(서버 보고용).
void start(std::function<void(const std::string&)> onDetect);
void stop();

}  // namespace watcher
