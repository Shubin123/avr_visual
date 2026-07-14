; blink_char.asm
; Simple LCD blink example: display the word "Blink" and make the first character
; (at row 1, column 1) toggle on/off using a Timer1 Compare A interrupt.
; Demonstrates LCD initialization, cursor positioning, character output, and a
; timer interrupt that repeatedly writes either a space or the character.
;
; The ATmega2560's Timer1 Compare A vector is at address 0x22 (used by the
; existing LCD driver example). We configure Timer1 for CTC mode with a prescaler
; of 1024 and a compare value that yields a visible blink rate.

.cseg
.org 0
    jmp start               ; reset vector jumps to start

.org 0x22                  ; Timer1 Compare A interrupt vector
    jmp timer1_isr

.dseg
.org 0x200
BLINK_FLAG: .byte 1        ; 0 = space, 1 = visible character

.cseg
.start
start:
    ; Initialize the LCD (driver code is in lcd.asm)
    rcall lcd_init

    ; Write the static text "Blink" at row 1, column 1.
    ldi r16, 1               ; row = 1
    ldi r17, 1               ; column = 1
    push r16
    push r17
    rcall lcd_gotoxy
    pop r17
    pop r16

    ; Write each character of the word.
    ldi r16, 'B'
    rcall lcd_putchar
    ldi r16, 'l'
    rcall lcd_putchar
    ldi r16, 'i'
    rcall lcd_putchar
    ldi r16, 'n'
    rcall lcd_putchar
    ldi r16, 'k'
    rcall lcd_putchar

    ; Configure Timer1 for CTC mode, compare value 7800 (≈0.5 s at 16 MHz/1024).
    ldi r16, high(7800)
    sts OCR1AH, r16
    ldi r16, low(7800)
    sts OCR1AL, r16

    ; TCCR1A = 0 (normal port operation)
    ldi r16, 0
    sts TCCR1A, r16
    ; TCCR1B: CTC (WGM12) + prescaler 1024 (CS12 | CS10)
    ldi r16, (1 << WGM12) | (1 << CS12) | (1 << CS10)
    sts TCCR1B, r16

    ; Enable Timer1 Compare A interrupt (OCIE1A)
    ldi r16, (1 << OCIE1A)
    sts TIMSK1, r16
    sei                      ; enable global interrupts

idle_loop:
    rjmp idle_loop           ; nothing else to do

; ---------------------------------------------------------------------
; Timer1 Compare A ISR – toggles the first character of the displayed text.
; ---------------------------------------------------------------------
; The ISR flips BLINK_FLAG between 0 and 1, then writes either a space or
; the character 'B' at the same cursor location.

timer1_isr:
    push r16
    push r17
    in r16, SREG
    push r16

    ; Flip the flag.
    lds r16, BLINK_FLAG
    eor r16, 1
    sts BLINK_FLAG, r16

    ; Choose the character to write.
    tst r16                 ; sets Z if flag == 0 (space)
    brne write_char
    ldi r16, ' '            ; space when flag cleared
    rjmp write_done
write_char:
    ldi r16, 'B'            ; visible character when flag set
write_done:
    ; Position cursor at row 1, column 1 again.
    ldi r17, 1
    push r16                ; preserve char on stack
    push r17
    ldi r16, 1
    rcall lcd_gotoxy
    pop r17
    pop r16
    rcall lcd_putchar

    pop r16                 ; restore SREG
    out SREG, r16
    pop r17
    pop r16
    reti

; Include the LCD driver (provides lcd_init, lcd_gotoxy, lcd_putchar).
.include "lcd.asm"
