; timer0-blink.asm
; Blink the PORTL LEDs using a Timer 0 overflow interrupt (no busy-wait delays).
; Demonstrates: configuring an 8-bit timer with a prescaler, enabling a timer
; overflow interrupt, writing an interrupt service routine, and using the
; global interrupt flag (sei).
;
; Timer 0 overflow vector address for the ATmega2560 is 0x2E.

.cseg
.org 0
    jmp start

.org 0x2E                  ; TIMER0 OVF interrupt vector
    jmp timer0_ovf_isr

start:
    ldi r16, 0xFF
    sts DDRL, r16          ; PORTL -> output (the 8 LEDs)
    clr r17                ; overflow counter (how many wraps so far)
    clr r18                ; current LED pattern

    ; Timer 0: normal mode, prescaler 1024 (CS02=1, CS00=1).
    ; At 16 MHz / 1024 the timer ticks every 64 us and overflows ~244 times/sec.
    ldi r16, (1 << CS02) | (1 << CS00)
    sts TCCR0B, r16

    ; Enable the Timer 0 overflow interrupt (TOIE0=1) and turn on interrupts.
    ldi r16, (1 << TOIE0)
    sts TIMSK0, r16
    sei

idle:
    rjmp idle              ; main loop does nothing; the ISR does the work

; --- Interrupt service routine -------------------------------------------
; Toggle the LEDs once every 32 overflows (~8 Hz), so the blink is visible.
timer0_ovf_isr:
    push r16
    in r16, SREG
    push r16

    inc r17
    cpi r17, 32
    brne isr_done
    clr r17                ; reset the overflow counter

    com r18                ; flip every bit of the pattern
    sts PORTL, r18

isr_done:
    pop r16
    out SREG, r16
    pop r16
    reti
