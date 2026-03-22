// go:build !windows
package main

import (
	"os"
	"os/signal"
	"syscall"
)

func setupSignalHandler() {
	c := make(chan os.Signal, 1)
	signal.Notify(c, syscall.SIGWINCH)
	go func() {
		for range c {
			// SIGWINCH 처리가 필요하다면 여기서 추가 (현재는 pty.Setsize로 처리)
		}
	}()
}
