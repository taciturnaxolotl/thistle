import { describe, expect, test } from "bun:test";
import {
	findMatchingMeetingTime,
	getDayName,
	getDayOfWeek,
	meetingTimeLabelMatchesDay,
} from "./audio-metadata";

describe("getDayOfWeek", () => {
	test("returns correct day number", () => {
		// January 1, 2024 is a Monday (day 1)
		const monday = new Date("2024-01-01T12:00:00Z");
		expect(getDayOfWeek(monday)).toBe(1);

		// January 7, 2024 is a Sunday (day 0)
		const sunday = new Date("2024-01-07T12:00:00Z");
		expect(getDayOfWeek(sunday)).toBe(0);

		// January 6, 2024 is a Saturday (day 6)
		const saturday = new Date("2024-01-06T12:00:00Z");
		expect(getDayOfWeek(saturday)).toBe(6);
	});
});

describe("getDayName", () => {
	test("returns correct day name", () => {
		expect(getDayName(new Date("2024-01-01T12:00:00Z"))).toBe("Monday");
		expect(getDayName(new Date("2024-01-02T12:00:00Z"))).toBe("Tuesday");
		expect(getDayName(new Date("2024-01-03T12:00:00Z"))).toBe("Wednesday");
		expect(getDayName(new Date("2024-01-04T12:00:00Z"))).toBe("Thursday");
		expect(getDayName(new Date("2024-01-05T12:00:00Z"))).toBe("Friday");
		expect(getDayName(new Date("2024-01-06T12:00:00Z"))).toBe("Saturday");
		expect(getDayName(new Date("2024-01-07T12:00:00Z"))).toBe("Sunday");
	});
});

describe("meetingTimeLabelMatchesDay", () => {
	test("matches full day names", () => {
		expect(meetingTimeLabelMatchesDay("Monday Lecture", "Monday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("Tuesday Lab", "Tuesday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("Wednesday Discussion", "Wednesday")).toBe(
			true,
		);
	});

	test("matches 3-letter abbreviations", () => {
		expect(meetingTimeLabelMatchesDay("Mon Lecture", "Monday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("Tue Lab", "Tuesday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("Wed Discussion", "Wednesday")).toBe(
			true,
		);
		expect(meetingTimeLabelMatchesDay("Thu Seminar", "Thursday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("Fri Workshop", "Friday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("Sat Review", "Saturday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("Sun Study", "Sunday")).toBe(true);
	});

	test("is case insensitive", () => {
		expect(meetingTimeLabelMatchesDay("MONDAY LECTURE", "Monday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("monday lecture", "Monday")).toBe(true);
		expect(meetingTimeLabelMatchesDay("MoNdAy LeCTuRe", "Monday")).toBe(true);
	});

	test("does not match wrong days", () => {
		expect(meetingTimeLabelMatchesDay("Monday Lecture", "Tuesday")).toBe(false);
		expect(meetingTimeLabelMatchesDay("Wednesday Lab", "Thursday")).toBe(false);
		expect(meetingTimeLabelMatchesDay("Lecture Hall A", "Monday")).toBe(false);
	});

	test("handles labels without day names", () => {
		expect(meetingTimeLabelMatchesDay("Lecture", "Monday")).toBe(false);
		expect(meetingTimeLabelMatchesDay("Lab Session", "Tuesday")).toBe(false);
		expect(meetingTimeLabelMatchesDay("Section A", "Wednesday")).toBe(false);
	});
});

describe("findMatchingMeetingTime", () => {
	const meetingTimes = [
		{ id: "mt1", label: "Monday Lecture" },
		{ id: "mt2", label: "Wednesday Discussion" },
		{ id: "mt3", label: "Friday Lab" },
	];

	test("finds correct meeting time for full day name", () => {
		const monday = new Date("2024-01-01T12:00:00Z"); // Monday
		expect(findMatchingMeetingTime(monday, meetingTimes)).toBe("mt1");

		const wednesday = new Date("2024-01-03T12:00:00Z"); // Wednesday
		expect(findMatchingMeetingTime(wednesday, meetingTimes)).toBe("mt2");

		const friday = new Date("2024-01-05T12:00:00Z"); // Friday
		expect(findMatchingMeetingTime(friday, meetingTimes)).toBe("mt3");
	});

	test("finds correct meeting time for abbreviated day name", () => {
		const abbrevMeetingTimes = [
			{ id: "mt1", label: "Mon Lecture" },
			{ id: "mt2", label: "Wed Discussion" },
			{ id: "mt3", label: "Fri Lab" },
		];

		const monday = new Date("2024-01-01T12:00:00Z");
		expect(findMatchingMeetingTime(monday, abbrevMeetingTimes)).toBe("mt1");
	});

	test("returns null when no match found", () => {
		const tuesday = new Date("2024-01-02T12:00:00Z"); // Tuesday
		expect(findMatchingMeetingTime(tuesday, meetingTimes)).toBe(null);

		const saturday = new Date("2024-01-06T12:00:00Z"); // Saturday
		expect(findMatchingMeetingTime(saturday, meetingTimes)).toBe(null);
	});

	test("returns null for empty meeting times", () => {
		const monday = new Date("2024-01-01T12:00:00Z");
		expect(findMatchingMeetingTime(monday, [])).toBe(null);
	});

	test("returns first match when multiple matches exist", () => {
		const duplicateMeetingTimes = [
			{ id: "mt1", label: "Monday Lecture" },
			{ id: "mt2", label: "Monday Lab" },
		];

		const monday = new Date("2024-01-01T12:00:00Z");
		expect(findMatchingMeetingTime(monday, duplicateMeetingTimes)).toBe("mt1");
	});
});
