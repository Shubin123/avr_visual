#define LCD_LIBONLY
; A version of "hello, world!" where the
; exclamation mark blinks using Timer 1 interrupts.

.cseg
.org 0 ; reset
	jmp start

.org 0x22
	jmp swap_chars_isr 


; The following file *must* be in the same
; directory as this "hello_world.asm".
.include "lcd.asm"

.cseg

; And so our program begins... and the *very*
; first thing we do is initialize the LCD
; display and all of the associated data
; needed for this display.
;
start:
	;initialize the LCD display
	rcall lcd_init

	;The following code configure the timer/counter1
	;When timer count up to 7800 (0x1E78), an interrupt happens.
	;Set the TOP value for timer1.
	;Note timer1 is a 16 bit timer, the max is 2^16 = 65,535.
	;You may set the TOP value for the timer at any number between 1 and 65,535.
	;In this lab, the TOP value is set at 7800.
	ldi r17, high(7800)
	ldi r16, low(7800)
	sts OCR1AH, r17
	sts OCR1AL, r16

	;configure the timer1
	ldi r16, 0
	sts TCCR1A, r16

	ldi r16, (1 << WGM12) | (1 << CS12) | (1 << CS10)
	sts TCCR1B, r16

	;TIMSK is used to enable timer1 interrupt.
	;must set bit OCIE1A (bit 1) to 1 and 
	;set the I flag in Status Register to 1.
	ldi r16, (1 << OCIE1A)
	sts TIMSK1, r16
	sei

	;display "Hello, world" starting at row 1, column 3.
	ldi r16, 1 ;row
	ldi r17, 3 ;column
	push r16
	push r17
	rcall lcd_gotoxy
	pop r17
	pop r16

	ldi r16, 'H'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'e'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'l'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'l'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'o'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, ','
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, ' '
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'w'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'o'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'r'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'l'
	push r16
	rcall lcd_putchar
	pop r16

	ldi r16, 'd'
	push r16
	rcall lcd_putchar
	pop r16


	; Our timer1 interrupt will swap these
	; two values at every interrupt. Our busy
	; loop, however, will simply write what
	; is in CHAR_ONE to the last position
	; on the LCD display
	;
	ldi r16, '!'
	sts CHAR_ONE, r16

	ldi r16, ' '
	sts CHAR_TWO, r16


	; Constantly place into the last LCD
	; location the value in CHAR_ONE.
	;
blink_loop:
	;figure out the (row, column) of '!' and make a change
	ldi r16, 1 ; row
	ldi r17, 15 ; column
	push r16
	push r17
	rcall lcd_gotoxy
	pop r17
	pop r16

	lds r16, CHAR_ONE
	push r16
	rcall lcd_putchar
	pop r16

	rjmp blink_loop

; The interrupt service routine
; When interrupt happens, isr swap the two characters in data memory at CHAR_ONE and CHAR_TWO.
; the blink_loop in the main always displays the character in CHAR_ONE
swap_chars_isr:
	push r16
	push r17
	in r16, SREG	; preserve the content of SREG on stack using IN
	push r16

	; swap CHAR_ONE and CHAR_TWO
	lds r16, CHAR_ONE
	lds r17, CHAR_TWO
	sts CHAR_TWO, r16
	sts CHAR_ONE, r17

	; restore the status register and registers
	pop r16
	out SREG, r16	; restore SREG using OUT
	pop r17
	pop r16
	reti


.dseg
CHAR_ONE: .byte 1
CHAR_TWO: .byte 1
