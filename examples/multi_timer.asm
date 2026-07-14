; multi_timer.asm
; Simple public multi-timer example for ATmega2560
; Cycles through multiple simulated software timers to toggle LEDs on PORTL

.cseg
.org 0

start:
    ldi r16, 0xFF
    sts DDRL, r16     ; Set PORTL to output
    clr r20           ; Timer 1 counter
    clr r21           ; Timer 2 counter

main_loop:
    inc r20
    cpi r20, 10
    brne check_t2
    clr r20
    rcall toggle_led_0

check_t2:
    inc r21
    cpi r21, 25
    brne main_delay
    clr r21
    rcall toggle_led_1

main_delay:
    rcall delay
    rjmp main_loop

toggle_led_0:
    lds r16, PORTL
    ldi r17, 0b00000001
    eor r16, r17
    sts PORTL, r16
    ret

toggle_led_1:
    lds r16, PORTL
    ldi r17, 0b00000010
    eor r16, r17
    sts PORTL, r16
    ret

delay:
    ldi r17, 0x05
d1: ldi r18, 0xFF
d2: ldi r19, 0xFF
d3: dec r19
    brne d3
    dec r18
    brne d2
    dec r17
    brne d1
    ret
